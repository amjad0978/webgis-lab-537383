from pathlib import Path

from django.contrib.gis.gdal import DataSource
from django.contrib.gis.geos import MultiPolygon

from .models import District

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "districts.geojson"


def run():
    layer = DataSource(str(DATA_FILE))[0]
    print(layer.name, ":", len(layer), "features,", layer.geom_type, "geometry")
    District.objects.all().delete()

    for feature in layer:
        geom = feature.geom.geos
        geom.srid = 4326
        if geom.geom_type == "Polygon":
            geom = MultiPolygon(geom, srid=4326)

        District.objects.create(
            name=feature.get("district"),
            province=feature.get("province"),
            pcode=feature.get("pcode"),
            pop_2023=feature.get("pop_2023"),
            area_km2=feature.get("area_km2"),
            geom=geom,
        )

    print(District.objects.count(), "districts saved")
