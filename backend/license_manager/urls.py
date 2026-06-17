from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from licenses.views import BorrowRecordViewSet, LicenseAttachmentViewSet, LicenseViewSet, stats_view


router = DefaultRouter()
router.register("licenses", LicenseViewSet, basename="license")
router.register("borrow-records", BorrowRecordViewSet, basename="borrow-record")
router.register("license-attachments", LicenseAttachmentViewSet, basename="license-attachment")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/stats/", stats_view, name="stats"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
