import os

from django.db import transaction
from django.db.models import Count, Q
from rest_framework import parsers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import BorrowRecord, License, LicenseAttachment
from .serializers import BorrowRecordSerializer, LicenseAttachmentSerializer, LicenseSerializer, LicenseDetailSerializer
from .services import dashboard_stats, refresh_borrow_status, refresh_license_status

ALLOWED_ATTACHMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".doc", ".docx"}
ALLOWED_ATTACHMENT_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/bmp",
    "image/tiff",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class LicenseViewSet(viewsets.ModelViewSet):
    serializer_class = LicenseSerializer

    def get_serializer_class(self):
        if self.action in ("retrieve",):
            return LicenseDetailSerializer
        return LicenseSerializer

    def get_queryset(self):
        queryset = License.objects.all()
        search = self.request.query_params.get("search")
        status = self.request.query_params.get("status")
        license_type = self.request.query_params.get("type")

        if self.action in ("list",):
            queryset = queryset.annotate(attachment_count=Count("attachments"))
        elif self.action in ("retrieve",):
            queryset = queryset.prefetch_related("attachments")

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(license_no__icontains=search)
                | Q(issuing_authority__icontains=search)
                | Q(owner_department__icontains=search)
            )
        if status:
            queryset = queryset.filter(status=status)
        if license_type:
            queryset = queryset.filter(license_type=license_type)
        return queryset

    def perform_create(self, serializer):
        license_obj = serializer.save()
        refresh_license_status(license_obj)

    def perform_update(self, serializer):
        license_obj = serializer.save()
        refresh_license_status(license_obj)


class BorrowRecordViewSet(viewsets.ModelViewSet):
    serializer_class = BorrowRecordSerializer

    def get_queryset(self):
        queryset = BorrowRecord.objects.select_related("license")
        status = self.request.query_params.get("status")
        license_id = self.request.query_params.get("license")
        if status:
            queryset = queryset.filter(status=status)
        if license_id:
            queryset = queryset.filter(license_id=license_id)
        return queryset

    def perform_create(self, serializer):
        record = serializer.save()
        refresh_borrow_status(record)

    def perform_update(self, serializer):
        record = serializer.save()
        refresh_borrow_status(record)


class LicenseAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = LicenseAttachmentSerializer
    parser_classes = [parsers.FormParser, parsers.MultiPartParser, parsers.JSONParser]

    def get_queryset(self):
        queryset = LicenseAttachment.objects.select_related("license")
        license_id = self.request.query_params.get("license")
        if license_id:
            queryset = queryset.filter(license_id=license_id)
        return queryset

    def _check_archived(self, license_obj):
        if license_obj.status == License.Status.ARCHIVED:
            raise PermissionDenied("归档证照的附件为只读，无法进行修改操作。")

    def _validate_file_type(self, uploaded_file, file_name):
        ext = os.path.splitext(file_name)[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            raise ValidationError(
                {
                    "file": f"不支持的文件格式「{ext}」，仅支持：{ ', '.join(sorted(ALLOWED_ATTACHMENT_EXTENSIONS)) }"
                }
            )
        content_type = getattr(uploaded_file, "content_type", "")
        if content_type and content_type not in ALLOWED_ATTACHMENT_MIMES:
            raise ValidationError(
                {
                    "file": f"文件类型「{content_type}」不在允许的 MIME 类型列表中，请上传合法的证照扫描件。"
                }
            )

    def create(self, request, *args, **kwargs):
        license_id = request.data.get("license")
        if not license_id:
            raise ValidationError({"license": "请指定证照ID"})
        try:
            license_obj = License.objects.get(id=license_id)
        except License.DoesNotExist:
            raise ValidationError({"license": "证照不存在"})

        self._check_archived(license_obj)

        uploaded_file = request.data.get("file")
        if not uploaded_file:
            raise ValidationError({"file": "请选择要上传的扫描件文件"})

        file_name = request.data.get("file_name") or getattr(uploaded_file, "name", "attachment")
        self._validate_file_type(uploaded_file, file_name)

        with transaction.atomic():
            last_attachment = LicenseAttachment.objects.filter(license=license_obj).order_by("-version").first()
            next_version = (last_attachment.version + 1) if last_attachment else 1

            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            attachment = serializer.save(
                license=license_obj,
                version=next_version,
                file_name=file_name,
                is_current=next_version == 1,
            )

            if request.data.get("set_current", True) and attachment.is_current:
                LicenseAttachment.objects.filter(license=license_obj).exclude(id=attachment.id).update(is_current=False)
            elif request.data.get("set_current", False):
                attachment.is_current = True
                attachment.save(update_fields=["is_current"])
                LicenseAttachment.objects.filter(license=license_obj).exclude(id=attachment.id).update(is_current=False)

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        self._check_archived(instance.license)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        set_current = request.data.get("is_current")
        if set_current is True and not instance.is_current:
            with transaction.atomic():
                LicenseAttachment.objects.filter(license=instance.license).update(is_current=False)
                instance.is_current = True
                self.perform_update(serializer)
        else:
            self.perform_update(serializer)

        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._check_archived(instance.license)
        was_current = instance.is_current
        license_obj = instance.license
        self.perform_destroy(instance)

        if was_current:
            latest = LicenseAttachment.objects.filter(license=license_obj).order_by("-version").first()
            if latest:
                latest.is_current = True
                latest.save(update_fields=["is_current"])

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def set_current(self, request, pk=None):
        attachment = self.get_object()
        self._check_archived(attachment.license)

        with transaction.atomic():
            LicenseAttachment.objects.filter(license=attachment.license).update(is_current=False)
            attachment.is_current = True
            attachment.save(update_fields=["is_current"])

        serializer = self.get_serializer(attachment)
        return Response(serializer.data)


@api_view(["GET"])
def stats_view(_request):
    stats = dashboard_stats()
    return Response(
        {
            **{key: value for key, value in stats.items() if key not in {"upcoming_expiries", "expired"}},
            "upcoming_expiries": LicenseSerializer(stats["upcoming_expiries"], many=True).data,
            "expired": LicenseSerializer(stats["expired"], many=True).data,
        }
    )
