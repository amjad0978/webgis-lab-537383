from django.contrib import admin

# Register your models here.
from django import forms
from django.contrib.gis import admin
from django.contrib.gis.db import models

from .models import District


@admin.register(District)
class DistrictAdmin(admin.GISModelAdmin):
    list_display = ["name", "province", "pop_2023", "area_km2"]
    list_filter = ["province"]
    search_fields = ["name", "pcode"]
    ordering = ["province", "name"]
    formfield_overrides = {
        models.IntegerField: {
            "widget": forms.NumberInput(attrs={"style": "width: 12em"})
        }
    }
