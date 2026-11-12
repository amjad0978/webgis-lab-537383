from django.contrib.gis import admin
from .models import Facility


@admin.register(Facility)
class FacilityAdmin(admin.GISModelAdmin):
    list_display = ["name", "kind", "added"]
    list_filter = ["kind"]
    search_fields = ["name"]