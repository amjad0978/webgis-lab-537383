"""Prepare compact GeoJSON inputs for the Quetta GIS dashboard."""

from __future__ import annotations

import argparse
import json
import logging
import math
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

import geopandas as gpd
import pandas as pd
from osgeo import gdal, ogr
from shapely import from_wkb


MAX_FILE_BYTES = 5 * 1024 * 1024
USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"
GEOFABRIK_PAKISTAN = "https://download.geofabrik.de/asia/pakistan-latest.osm.pbf"
WGS84 = "EPSG:4326"
AREA_CRS = "EPSG:32642"
QUETTA_CENTER = (30.141413, 67.077434)
FACILITY_CLASSES = {
    "hospitals": {"hospital", "clinic"},
    "schools": {"school", "college", "university"},
    "parks": {"park", "recreation_ground", "garden"},
}


def normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def find_field(columns, candidates, contains=()):
    by_normalized = {normalized(str(column)): column for column in columns}
    for candidate in candidates:
        key = normalized(candidate)
        if key in by_normalized:
            return by_normalized[key]
    for column in columns:
        key = normalized(str(column))
        if any(token in key for token in contains):
            return column
    return None


def vector_paths(data_root: Path, lab_root: Path):
    extensions = {".geojson", ".json", ".shp", ".gpkg"}
    seen = set()
    for root in (data_root, lab_root):
        if root.exists():
            for path in root.rglob("*"):
                if path.is_file() and path.suffix.casefold() in extensions:
                    resolved = path.resolve()
                    if resolved not in seen:
                        seen.add(resolved)
                        yield path


def read_vector(path: Path) -> gpd.GeoDataFrame:
    frame = gpd.read_file(path)
    if frame.crs is None:
        logging.warning("%s has no CRS; treating coordinates as EPSG:4326.", path)
        frame = frame.set_crs(WGS84)
    return frame.to_crs(WGS84)


def find_quetta_boundary(paths):
    name_candidates = ("district", "adm2_name", "district_name", "name")
    for path in paths:
        try:
            frame = read_vector(path)
        except Exception as error:
            logging.warning("Skipping unreadable vector %s: %s", path, error)
            continue
        name_field = find_field(frame.columns, name_candidates, ("district", "adm2name"))
        if name_field is None:
            continue
        matches = frame[
            frame[name_field].astype("string").str.casefold().str.contains("quetta", na=False)
        ]
        if not matches.empty:
            logging.info("District source: %s; name field: %s", path, name_field)
            return matches.iloc[[0]].copy(), path, name_field
    raise FileNotFoundError(
        "No supplied vector file has a district-name attribute containing Quetta. "
        "Add a Quetta district GeoJSON/shapefile under C:\\webgis-data and rerun."
    )


def clean_geometries(frame: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    frame = frame.loc[frame.geometry.notna()].copy()
    frame = frame.loc[~frame.geometry.is_empty].copy()
    if not frame.empty:
        frame.geometry = frame.geometry.make_valid()
        frame = frame.loc[~frame.geometry.is_empty].copy()
    return frame


def simplify_frame(frame: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    projected = frame.to_crs(AREA_CRS)
    projected.geometry = projected.geometry.simplify(tolerance_m, preserve_topology=True)
    return projected.to_crs(WGS84)


def write_compact(frame: gpd.GeoDataFrame, target: Path, tolerance_m=8):
    target.parent.mkdir(parents=True, exist_ok=True)
    working = clean_geometries(frame.to_crs(WGS84))
    for tolerance in (tolerance_m, 20, 50, 100, 250, 500):
        simplified = simplify_frame(working, tolerance) if not working.empty else working
        simplified.to_file(target, driver="GeoJSON", index=False)
        if target.stat().st_size <= MAX_FILE_BYTES:
            logging.info("Wrote %s (%.2f MB, simplify tolerance %sm).",
                         target, target.stat().st_size / 1_000_000, tolerance)
            return
    raise ValueError(
        f"{target} remains larger than 5 MB after simplification. "
        "Reduce source attributes/features or increase the tolerance in prepare_data.py."
    )


def empty_feature_collection(target: Path):
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": []}, separators=(",", ":")),
        encoding="utf-8",
    )
    logging.warning(
        "%s is empty: no supplied vector data with a matching OSM fclass was found.",
        target.name,
    )


def osm_tag(properties, key):
    wanted = normalized(key)
    for name, value in properties.items():
        if normalized(str(name)) == wanted and pd.notna(value) and str(value).strip():
            return str(value).strip()
    other_tags = properties.get("other_tags")
    if pd.notna(other_tags):
        tags = dict(re.findall(r'"([^"]+)"=>"(.*?)"', str(other_tags)))
        for name, value in tags.items():
            if normalized(name) == wanted:
                return value
    return None


def read_osm_pbf(path: Path, boundary: gpd.GeoDataFrame):
    bounds = tuple(boundary.total_bounds)
    records = {name: [] for name in FACILITY_CLASSES}
    boundary_geometry = boundary.geometry.union_all()
    gdal.SetConfigOption("OGR_INTERLEAVED_READING", "YES")
    dataset = ogr.Open(str(path), 0)
    if dataset is None:
        raise RuntimeError(f"GDAL could not open OSM PBF: {path}")

    wanted_layers = {"points", "multipolygons"}
    layer_names = {
        dataset.GetLayer(index).GetName()
        for index in range(dataset.GetLayerCount())
    }
    if not wanted_layers.issubset(layer_names):
        raise RuntimeError(
            f"OSM PBF is missing required layers {sorted(wanted_layers - layer_names)}: {path}"
        )
    for index in range(dataset.GetLayerCount()):
        dataset.GetLayer(index).SetSpatialFilterRect(*bounds)

    while True:
        result = dataset.GetNextFeature()
        if result is None:
            break
        feature, layer_name = result
        if layer_name not in wanted_layers:
            continue
        raw_properties = {
            feature.GetFieldDefnRef(index).GetNameRef(): feature.GetField(index)
            for index in range(feature.GetFieldCount())
        }
        amenity = (osm_tag(raw_properties, "amenity") or "").casefold()
        healthcare = (osm_tag(raw_properties, "healthcare") or "").casefold()
        leisure = (osm_tag(raw_properties, "leisure") or "").casefold()
        landuse = (osm_tag(raw_properties, "landuse") or "").casefold()
        if amenity in {"hospital", "clinic", "doctors"} or healthcare in {
            "hospital", "clinic", "doctor", "doctors"
        }:
            kind = "hospitals"
            fclass = "clinic" if amenity in {"clinic", "doctors"} or healthcare in {
                "clinic", "doctor", "doctors"
            } else "hospital"
        elif amenity in {"school", "college", "university"}:
            kind, fclass = "schools", amenity
        elif leisure in {"park", "garden"} or landuse == "recreation_ground":
            kind = "parks"
            fclass = landuse if landuse == "recreation_ground" else leisure
        else:
            continue

        ogr_geometry = feature.GetGeometryRef()
        if ogr_geometry is None:
            continue
        geometry = from_wkb(bytes(ogr_geometry.ExportToWkb()))
        if geometry.is_empty or not geometry.intersects(boundary_geometry):
            continue
        name = osm_tag(raw_properties, "name")
        records[kind].append({
            "geometry": geometry,
            "fclass": fclass,
            "name": name,
            "osm_id": str(raw_properties.get("osm_id") or raw_properties.get("osm_way_id") or ""),
            "source": "OpenStreetMap via Geofabrik Pakistan extract",
            "source_url": "https://download.geofabrik.de/asia/pakistan.html",
        })
    dataset = None

    clipped_frames = {name: [] for name in FACILITY_CLASSES}
    for kind, features in records.items():
        if not features:
            continue
        frame = gpd.GeoDataFrame(
            [{key: value for key, value in record.items() if key != "geometry"}
             for record in features],
            geometry=[record["geometry"] for record in features],
            crs=WGS84,
        )
        frame = gpd.clip(frame, boundary_geometry)
        if frame.empty:
            continue
        if kind != "parks":
            frame.geometry = frame.geometry.representative_point()
        clipped_frames[kind].append(frame)
    logging.info(
        "Extracted OSM PBF features in Quetta: %s.",
        ", ".join(f"{name}={sum(len(frame) for frame in frames)}"
                  for name, frames in clipped_frames.items()),
    )
    return clipped_frames


def download_osm_pbf(path: Path):
    request = urllib.request.Request(
        GEOFABRIK_PAKISTAN,
        headers={"User-Agent": "QuettaGISDashboard/1.0 (static data preparation)"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        last_modified = response.headers.get("Last-Modified", "date not supplied")
        with path.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    logging.info("Downloaded current Geofabrik Pakistan OSM extract (%s): %s",
                 last_modified, path)


def prepare_population(paths, boundary, target):
    population_candidates = ("population", "pop_2023", "pop2023", "pop")
    for path in paths:
        try:
            frame = read_vector(path)
        except Exception as error:
            logging.warning("Skipping unreadable population candidate %s: %s", path, error)
            continue
        population_field = find_field(frame.columns, population_candidates, ("population",))
        if population_field is None:
            population_field = find_field(frame.columns, ("pop_2023", "pop"))
        if population_field is None:
            continue

        district_field = find_field(
            frame.columns, ("district", "adm2_name", "district_name"), ("district", "adm2name")
        )
        if district_field is not None:
            frame = frame[
                frame[district_field].astype("string").str.casefold().str.contains(
                    "quetta", na=False
                )
            ].copy()
        if frame.empty:
            continue

        frame = clean_geometries(frame)
        frame = gpd.clip(frame, boundary.geometry.union_all())
        if frame.empty:
            continue
        frame["population"] = pd.to_numeric(frame[population_field], errors="coerce")
        logging.info("Population source: %s; selected field: %s", path, population_field)
        return write_compact(frame, target, 10)

    logging.warning(
        "No population, tehsil, or union-council layer was found. "
        "Using the Quetta district polygon with editable population=0."
    )
    fallback = boundary.copy()
    fallback["population"] = 0
    fallback["population_source"] = "edit this value: no local population input was found"
    write_compact(fallback, target, 10)


def prepare_facilities(paths, boundary, output_dir, osm_pbf=None):
    class_field_candidates = ("fclass", "feature_class", "class")
    found_any_osm_source = False
    output_frames = {name: [] for name in FACILITY_CLASSES}

    for path in paths:
        try:
            frame = read_vector(path)
        except Exception as error:
            logging.warning("Skipping unreadable facility candidate %s: %s", path, error)
            continue
        class_field = find_field(frame.columns, class_field_candidates, ("fclass",))
        if class_field is None:
            continue
        found_any_osm_source = True
        values = frame[class_field].astype("string").str.casefold()
        for output_name, accepted in FACILITY_CLASSES.items():
            selected = frame.loc[values.isin(accepted)].copy()
            if selected.empty:
                continue
            selected = clean_geometries(selected)
            selected = gpd.clip(selected, boundary.geometry.union_all())
            if selected.empty:
                continue
            if output_name == "parks":
                projected = selected.to_crs(AREA_CRS)
                selected["area_m2"] = projected.geometry.area.round(2).to_numpy()
                selected["area_ha"] = (selected["area_m2"] / 10_000).round(4)
                selected["area_acres"] = (selected["area_m2"] / 4_046.8564224).round(4)
            else:
                selected.geometry = selected.geometry.representative_point()
            output_frames[output_name].append(selected)
        logging.info("OSM-like feature source: %s; class field: %s", path, class_field)

    if osm_pbf is not None:
        if not osm_pbf.is_file():
            raise FileNotFoundError(
                f"OSM PBF file does not exist: {osm_pbf}. Download Pakistan OSM data "
                "or pass a valid path with --osm-pbf."
            )
        osm_frames = read_osm_pbf(osm_pbf, boundary)
        if not any(osm_frames.values()):
            raise ValueError(
                f"No matching healthcare, school, or park features were found inside "
                f"the Quetta boundary in {osm_pbf}. Existing output layers were not replaced."
            )
        for output_name, frames in osm_frames.items():
            for selected in frames:
                if output_name == "parks":
                    projected = selected.to_crs(AREA_CRS)
                    selected["area_m2"] = projected.geometry.area.round(2).to_numpy()
                    selected["area_ha"] = (selected["area_m2"] / 10_000).round(4)
                    selected["area_acres"] = (selected["area_m2"] / 4_046.8564224).round(4)
                output_frames[output_name].append(selected)
        found_any_osm_source = True

    for output_name, frames in output_frames.items():
        target = output_dir / f"{output_name}.geojson"
        if frames:
            combined = gpd.GeoDataFrame(
                pd.concat(frames, ignore_index=True),
                geometry="geometry",
                crs=WGS84,
            )
            write_compact(combined, target)
        else:
            empty_feature_collection(target)

    if not found_any_osm_source:
        logging.warning(
            "No OSM fclass attribute exists in the supplied data. "
            "Hospitals, schools, and parks are empty until OSM data is added."
        )


def prepare_earthquake_backup(target, reuse_existing=False):
    if reuse_existing and target.exists():
        feed = json.loads(target.read_text(encoding="utf-8"))
        logging.info("Reusing the previously downloaded USGS feed at %s.", target)
    else:
        request = urllib.request.Request(
            USGS_FEED,
            headers={"User-Agent": "QuettaGISDashboard/1.0 (static data preparation)"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            feed = json.load(response)
    nearby = []
    for feature in feed.get("features", []):
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        if len(coordinates) < 2:
            continue
        longitude, latitude = coordinates[:2]
        lat1, lat2 = math.radians(QUETTA_CENTER[0]), math.radians(latitude)
        delta_lat = lat2 - lat1
        delta_lon = math.radians(longitude - QUETTA_CENTER[1])
        haversine = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
        )
        distance_km = 6371.0088 * 2 * math.asin(math.sqrt(haversine))
        if distance_km <= 500:
            nearby.append(feature)
    feed["features"] = nearby
    feed.pop("bbox", None)
    if isinstance(feed.get("metadata"), dict):
        feed["metadata"]["count"] = len(nearby)
    target.write_text(json.dumps(feed, separators=(",", ":")), encoding="utf-8")
    if target.stat().st_size > MAX_FILE_BYTES:
        raise ValueError(
            f"The USGS feed filtered to 500 km is {target.stat().st_size / 1_000_000:.2f} MB "
            "(limit 5 MB). Reduce the backup radius or attributes in prepare_data.py."
        )
    logging.info("Downloaded USGS backup: %s (%d events within 500 km, %.2f MB).",
                 target, len(nearby), target.stat().st_size / 1_000_000)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=Path(r"C:\webgis-data"))
    parser.add_argument("--lab-root", type=Path, default=Path(r"C:\webgis-lab"))
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "data")
    osm_source = parser.add_mutually_exclusive_group()
    osm_source.add_argument(
        "--osm-pbf",
        type=Path,
        help="Use a previously downloaded OSM PBF extract, clipped to Quetta.",
    )
    osm_source.add_argument(
        "--download-osm",
        action="store_true",
        help="Download and process the current Geofabrik Pakistan OSM extract.",
    )
    parser.add_argument(
        "--reuse-earthquake-backup",
        action="store_true",
        help="Filter an existing downloaded backup instead of requesting the USGS feed again.",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    output_root = args.output.resolve()
    paths = [
        path for path in vector_paths(args.data_root, args.lab_root)
        if output_root not in path.resolve().parents
    ]
    if not paths:
        raise FileNotFoundError(
            f"No supported vector files were found under {args.data_root} or {args.lab_root}."
        )
    logging.info("Scanned %d vector files.", len(paths))

    boundary_frame, _, name_field = find_quetta_boundary(paths)
    boundary = clean_geometries(boundary_frame)
    boundary["district_name"] = boundary[name_field].astype(str)
    boundary_output = args.output / "quetta_district.geojson"
    write_compact(boundary, boundary_output, 15)

    prepare_population(paths, boundary, args.output / "population.geojson")
    if args.download_osm:
        with tempfile.TemporaryDirectory(prefix="quetta-osm-") as temporary_directory:
            pbf_path = Path(temporary_directory) / "pakistan-latest.osm.pbf"
            download_osm_pbf(pbf_path)
            prepare_facilities(paths, boundary, args.output, pbf_path)
    else:
        prepare_facilities(paths, boundary, args.output, args.osm_pbf)
    prepare_earthquake_backup(
        args.output / "earthquakes_backup.geojson",
        reuse_existing=args.reuse_earthquake_backup,
    )

    oversized = [
        str(path) for path in args.output.glob("*.geojson")
        if path.stat().st_size > MAX_FILE_BYTES
    ]
    if oversized:
        raise ValueError("Output GeoJSON file(s) exceed 5 MB: " + ", ".join(oversized))
    logging.info("Data preparation completed in %s.", args.output)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logging.error("%s", error)
        sys.exit(1)
