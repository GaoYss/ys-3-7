from rest_framework import serializers

from .models import BorrowRecord, License, LicenseAttachment


class LicenseAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_size = serializers.IntegerField(read_only=True)
    file_extension = serializers.CharField(read_only=True)
    is_archived = serializers.SerializerMethodField()

    class Meta:
        model = LicenseAttachment
        fields = [
            "id",
            "license",
            "file",
            "file_url",
            "file_name",
            "version",
            "is_current",
            "uploaded_by",
            "description",
            "file_size",
            "file_extension",
            "is_archived",
            "created_at",
        ]
        read_only_fields = ["license", "version", "file_name", "file_url", "file_size", "file_extension", "is_archived", "created_at"]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if request and obj.file:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else None

    def get_is_archived(self, obj):
        return obj.license.status == License.Status.ARCHIVED


class LicenseSerializer(serializers.ModelSerializer):
    days_until_expiry = serializers.IntegerField(read_only=True)
    computed_status = serializers.CharField(read_only=True)
    license_type_display = serializers.CharField(source="get_license_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    attachment_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = License
        fields = [
            "id",
            "name",
            "license_no",
            "license_type",
            "license_type_display",
            "issuing_authority",
            "owner_department",
            "keeper",
            "issue_date",
            "expiry_date",
            "reminder_days",
            "status",
            "status_display",
            "computed_status",
            "days_until_expiry",
            "notes",
            "attachment_count",
            "created_at",
            "updated_at",
        ]


class LicenseDetailSerializer(LicenseSerializer):
    attachments = LicenseAttachmentSerializer(many=True, read_only=True)
    current_attachment = serializers.SerializerMethodField()

    class Meta(LicenseSerializer.Meta):
        fields = LicenseSerializer.Meta.fields + ["attachments", "current_attachment"]

    def get_current_attachment(self, obj):
        current = obj.attachments.filter(is_current=True).first()
        if current:
            return LicenseAttachmentSerializer(current, context=self.context).data
        return None


class BorrowRecordSerializer(serializers.ModelSerializer):
    license_name = serializers.CharField(source="license.name", read_only=True)
    computed_status = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = BorrowRecord
        fields = [
            "id",
            "license",
            "license_name",
            "borrower",
            "borrower_department",
            "purpose",
            "borrow_date",
            "expected_return_date",
            "actual_return_date",
            "status",
            "status_display",
            "computed_status",
            "notes",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        borrow_date = attrs.get("borrow_date", getattr(self.instance, "borrow_date", None))
        expected_return_date = attrs.get("expected_return_date", getattr(self.instance, "expected_return_date", None))
        actual_return_date = attrs.get("actual_return_date", getattr(self.instance, "actual_return_date", None))

        if expected_return_date and borrow_date and expected_return_date < borrow_date:
            raise serializers.ValidationError({"expected_return_date": "预计归还日期不能早于借出日期"})
        if actual_return_date and borrow_date and actual_return_date < borrow_date:
            raise serializers.ValidationError({"actual_return_date": "实际归还日期不能早于借出日期"})
        return attrs
