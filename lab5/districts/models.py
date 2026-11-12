from django.db import models

# Create your models here.
from django.contrib.gis.db import models


class District(models.Model):
    name = models.CharField(max_length=100)
    province = models.CharField(max_length=50)
    pcode = models.CharField(max_length=10, unique=True)
    pop_2023 = models.IntegerField(null=True, blank=True)
    area_km2 = models.FloatField()
    geom = models.MultiPolygonField(srid=4326)

    class Meta:
        ordering = ["province", "name"]

    def __str__(self):
        return f"{self.name} ({self.province})"
