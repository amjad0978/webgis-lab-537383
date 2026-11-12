from django.shortcuts import render
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework_gis.filters import InBBoxFilter

from .models import District
from .serializers import DistrictSerializer


def map_page(request):
    return render(request, "districts/map.html")


class DistrictViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = District.objects.all()
    serializer_class = DistrictSerializer

    filter_backends = [InBBoxFilter, DjangoFilterBackend]
    bbox_filter_field = "geom"
    bbox_filter_include_overlapping = True
    filterset_fields = ["province"]