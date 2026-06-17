from django.contrib import admin

from .models import BorrowRecord, License, LicenseAttachment


@admin.register(License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ("name", "license_type", "owner_department", "expiry_date", "status")
    list_filter = ("license_type", "status", "owner_department")
    search_fields = ("name", "license_no", "issuing_authority")


@admin.register(BorrowRecord)
class BorrowRecordAdmin(admin.ModelAdmin):
    list_display = ("license", "borrower", "borrow_date", "expected_return_date", "actual_return_date", "status")
    list_filter = ("status", "borrow_date")
    search_fields = ("license__name", "borrower", "purpose")


@admin.register(LicenseAttachment)
class LicenseAttachmentAdmin(admin.ModelAdmin):
    list_display = ("license", "version", "file_name", "is_current", "uploaded_by", "created_at")
    list_filter = ("is_current", "version")
    search_fields = ("license__name", "file_name", "description")
    readonly_fields = ("version", "file_size", "file_extension", "created_at")
    list_select_related = ("license",)
