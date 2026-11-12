from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from districts.views import DistrictViewSet, map_page
from facilities.views import FacilityViewSet

router = DefaultRouter()
router.register("districts", DistrictViewSet)
router.register("facilities", FacilityViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("", map_page, name="map"),
]