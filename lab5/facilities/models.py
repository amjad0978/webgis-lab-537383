from django.contrib.gis.db import models


class Facility(models.Model):
    KINDS = [
        ("school", "School"),
        ("health", "Health facility"),
        ("water", "Water point"),
        ("other", "Other"),
    ]

    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, choices=KINDS, default="other")
    added = models.DateTimeField(auto_now_add=True)
    geom = models.PointField(srid=4326)

    class Meta:
        verbose_name_plural = "facilities"
        ordering = ["-added"]

    def __str__(self):
        return self.name