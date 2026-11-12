import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ---- GDAL / GEOS from QGIS ----
QGIS = r"C:\Program Files\QGIS 3.40.6"
os.environ["PATH"] = QGIS + r"\bin;" + os.environ["PATH"]
os.add_dll_directory(QGIS + r"\bin")
os.environ["PROJ_LIB"] = QGIS + r"\share\proj"
os.environ["GDAL_DATA"] = QGIS + r"\share\gdal"
GDAL_LIBRARY_PATH = QGIS + r"\bin\gdal310.dll"
GEOS_LIBRARY_PATH = QGIS + r"\bin\geos_c.dll"
# -------------------------------

SECRET_KEY = 'django-insecure-lab5-dev-key-change-me'

DEBUG = True

ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.gis',
    'rest_framework',
    'rest_framework_gis',
    'django_filters',
    'districts',
       'facilities',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'webgis.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'webgis.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': 'webgis',
        'USER': 'postgres',
        'PASSWORD': os.environ.get('WEBGIS_DB_PASSWORD', ''),
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"