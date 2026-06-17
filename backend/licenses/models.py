import os

from django.db import models
from django.utils import timezone


def attachment_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1]
    return f"license_attachments/license_{instance.license_id}/v{instance.version}{ext}"


class License(models.Model):
    class LicenseType(models.TextChoices):
        BUSINESS = "business", "营业执照"
        PERMIT = "permit", "经营许可"
        QUALIFICATION = "qualification", "资质证书"
        TAX = "tax", "税务证照"
        OTHER = "other", "其他"

    class Status(models.TextChoices):
        ACTIVE = "active", "有效"
        EXPIRING = "expiring", "即将到期"
        EXPIRED = "expired", "已到期"
        ARCHIVED = "archived", "已归档"

    name = models.CharField("证照名称", max_length=120)
    license_no = models.CharField("证照编号", max_length=80, unique=True)
    license_type = models.CharField("证照类型", max_length=32, choices=LicenseType.choices)
    issuing_authority = models.CharField("发证机关", max_length=120)
    owner_department = models.CharField("归属部门", max_length=80)
    keeper = models.CharField("保管人", max_length=60, blank=True)
    issue_date = models.DateField("发证日期")
    expiry_date = models.DateField("到期日期")
    reminder_days = models.PositiveIntegerField("提前提醒天数", default=30)
    status = models.CharField("状态", max_length=32, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField("备注", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["expiry_date", "name"]

    def __str__(self):
        return self.name

    @property
    def days_until_expiry(self):
        return (self.expiry_date - timezone.localdate()).days

    @property
    def computed_status(self):
        if self.status == self.Status.ARCHIVED:
            return self.Status.ARCHIVED
        days_left = self.days_until_expiry
        if days_left < 0:
            return self.Status.EXPIRED
        if days_left <= self.reminder_days:
            return self.Status.EXPIRING
        return self.Status.ACTIVE


class BorrowRecord(models.Model):
    class Status(models.TextChoices):
        BORROWED = "borrowed", "借出中"
        RETURNED = "returned", "已归还"
        OVERDUE = "overdue", "逾期未还"

    license = models.ForeignKey(License, on_delete=models.CASCADE, related_name="borrow_records", verbose_name="证照")
    borrower = models.CharField("借用人", max_length=60)
    borrower_department = models.CharField("借用部门", max_length=80)
    purpose = models.CharField("用途", max_length=200)
    borrow_date = models.DateField("借出日期", default=timezone.localdate)
    expected_return_date = models.DateField("预计归还日期")
    actual_return_date = models.DateField("实际归还日期", null=True, blank=True)
    status = models.CharField("状态", max_length=32, choices=Status.choices, default=Status.BORROWED)
    notes = models.TextField("备注", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-borrow_date", "-created_at"]

    def __str__(self):
        return f"{self.license.name} - {self.borrower}"

    @property
    def computed_status(self):
        if self.actual_return_date:
            return self.Status.RETURNED
        if self.expected_return_date < timezone.localdate():
            return self.Status.OVERDUE
        return self.Status.BORROWED


class LicenseAttachment(models.Model):
    license = models.ForeignKey(License, on_delete=models.CASCADE, related_name="attachments", verbose_name="证照")
    file = models.FileField("扫描件", upload_to=attachment_upload_path)
    file_name = models.CharField("原始文件名", max_length=255)
    version = models.PositiveIntegerField("版本号", default=1)
    is_current = models.BooleanField("当前有效版本", default=False)
    uploaded_by = models.CharField("上传人", max_length=60, blank=True, default="系统")
    description = models.CharField("版本说明", max_length=255, blank=True)
    created_at = models.DateTimeField("上传时间", auto_now_add=True)

    class Meta:
        ordering = ["-version", "-created_at"]
        unique_together = [["license", "version"]]
        verbose_name = "证照附件"
        verbose_name_plural = "证照附件"

    def __str__(self):
        return f"{self.license.name} - v{self.version}"

    @property
    def file_size(self):
        try:
            return self.file.size
        except Exception:
            return 0

    @property
    def file_extension(self):
        return os.path.splitext(self.file_name)[1].lower()
