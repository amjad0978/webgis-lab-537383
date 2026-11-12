# Lab 4: GeoDjango and PostGIS

This project carries the Lab 3 district dataset into PostgreSQL/PostGIS, serves it
from Django, and displays it with Leaflet.

## Local setup

The checked-in dependency list can be installed into a virtual environment:

```powershell
py -3.12 -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a PostgreSQL database named `webgis` and enable PostGIS in it:

```sql
CREATE EXTENSION postgis;
```

The Django settings read the database connection from `WEBGIS_DB_*` environment
variables. `WEBGIS_DB_PASSWORD` is optional for local PostgreSQL installations
that use trusted local connections; do not put credentials in source files.
The checked-in `DJANGO_SECRET_KEY` fallback is for local development only. Set a
private environment value before exposing the project beyond localhost.

On Windows, `webgis/settings.py` points GeoDjango at the QGIS 3.40.6 GDAL, GEOS,
and PROJ libraries installed on this machine. Update `OSGEO4W` there if QGIS is
installed in another location.

## Load and run

```powershell
python manage.py makemigrations districts
python manage.py migrate
python manage.py shell -c "from districts import load; load.run()"
python manage.py createsuperuser
python manage.py runserver
```

Open `http://127.0.0.1:8000/` for the Leaflet map or
`http://127.0.0.1:8000/admin/` for the GIS admin. District GeoJSON is available
at `/api/districts/`; `/api/where/?lat=33.6423&lng=72.9906` runs the spatial
containment query.

## Checks

Run `python manage.py test` to exercise the API, province filtering, and
PostGIS-backed point-in-polygon query.
