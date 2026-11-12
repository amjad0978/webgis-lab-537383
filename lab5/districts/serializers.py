from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import District


class DistrictSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = District
        geo_field = "geom"
        fields = ["id", "name", "province", "pcode", "pop_2023", "area_km2"]