from django.contrib.gis.geos import MultiPolygon, Polygon
from django.test import TestCase

from .models import District


class DistrictEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        District.objects.create(
            name="Test District",
            province="Punjab",
            pcode="TST001",
            pop_2023=12345,
            area_km2=10.0,
            geom=MultiPolygon(
                Polygon(
                    [
                        (70, 30),
                        (71, 30),
                        (71, 31),
                        (70, 31),
                        (70, 30),
                    ],
                    srid=4326,
                ),
                srid=4326,
            ),
        )

    def test_map_page_renders(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Districts from PostGIS")

    def test_geojson_api_returns_database_feature(self):
        response = self.client.get("/api/districts/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/geo+json")
        feature = response.json()["features"][0]
        self.assertEqual(feature["properties"]["name"], "Test District")
        self.assertEqual(feature["geometry"]["type"], "MultiPolygon")

    def test_geojson_api_filters_by_province(self):
        self.assertEqual(
            len(self.client.get("/api/districts/?province=Punjab").json()["features"]),
            1,
        )
        self.assertEqual(
            len(self.client.get("/api/districts/?province=Sindh").json()["features"]),
            0,
        )

    def test_spatial_api_finds_containing_district(self):
        response = self.client.get("/api/where/?lat=30.5&lng=70.5")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["district"], "Test District")

    def test_spatial_api_rejects_invalid_coordinates(self):
        response = self.client.get("/api/where/?lat=999&lng=70")

        self.assertEqual(response.status_code, 400)
