import { Archive, CheckCircle2, ChevronLeft, Download, FileText, Plus, RefreshCw, Save, Star, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { api } from '../api/client.js'
import { licenseStatuses, licenseTypes } from '../api/options.js'
import { EmptyState } from '../components/EmptyState.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'

const initialForm = {
  name: '',
  license_no: '',
  license_type: 'business',
  issuing_authority: '',
  owner_department: '',
  keeper: '',
  issue_date: '',
  expiry_date: '',
  reminder_days: 30,
  status: 'active',
  notes: '',
}

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.doc', '.docx']
const MAX_FILE_SIZE = 50 * 1024 * 1024

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

const formatDate = (iso) => {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LicensePage({ licenses, reload, updateLicenseInList, notify }) {
  const [form, setForm] = useState(initialForm)
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [saving, setSaving] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadedBy, setUploadedBy] = useState('')
  const fileInputRef = useRef(null)

  const isArchived = selectedLicense?.status === 'archived'

  const syncLicenseDetail = async (prevDetail) => {
    try {
      const resp = await api.getLicense(selectedLicense.id)
      const fresh = resp.results || resp
      setSelectedLicense(fresh)
      if (updateLicenseInList) {
        updateLicenseInList(selectedLicense.id, {
          attachment_count: fresh.attachment_count,
        })
      }
      return fresh
    } catch (syncError) {
      setSelectedLicense(prevDetail)
      if (updateLicenseInList) {
        updateLicenseInList(selectedLicense.id, {
          attachment_count: prevDetail.attachment_count,
        })
      }
      throw syncError
    }
  }

  const filteredLicenses = useMemo(
    () =>
      licenses.filter((item) => {
        const keyword = filters.search.trim().toLowerCase()
        const matchKeyword =
          !keyword ||
          [item.name, item.license_no, item.issuing_authority, item.owner_department]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        const matchStatus = !filters.status || item.computed_status === filters.status || item.status === filters.status
        return matchKeyword && matchStatus
      }),
    [licenses, filters],
  )

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api.createLicense(form)
      setForm(initialForm)
      await reload()
      notify('证照已录入')
    } catch (error) {
      notify(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleLicenseClick = async (license) => {
    try {
      const detail = await api.getLicense(license.id)
      setSelectedLicense(detail.results || detail)
    } catch (error) {
      notify(error.message)
    }
  }

  const closeDetail = () => {
    setSelectedLicense(null)
    setUploadDesc('')
    setUploadedBy('')
  }

  const handleFileSelect = () => {
    if (isArchived) {
      notify('归档证照无法上传附件')
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedLicense) return

    const ext = file.name.slice(((file.name.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase()
    const fileExt = ext ? `.${ext}` : ''
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      notify(`不支持的文件格式「${fileExt || '未知'}」，仅支持：${ALLOWED_EXTENSIONS.join('、')}`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      notify(`文件大小（${formatFileSize(file.size)}）超过上限 50MB，请压缩后再上传。`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    const prevDetail = { ...selectedLicense }
    try {
      const formData = new FormData()
      formData.append('license', selectedLicense.id)
      formData.append('file', file)
      formData.append('file_name', file.name)
      if (uploadDesc.trim()) formData.append('description', uploadDesc.trim())
      if (uploadedBy.trim()) formData.append('uploaded_by', uploadedBy.trim())
      formData.append('set_current', 'true')

      await api.uploadAttachment(formData)
      setUploadDesc('')
      setUploadedBy('')
      await syncLicenseDetail(prevDetail)
      notify('附件上传成功')
      reload()
    } catch (error) {
      notify(error.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSetCurrent = async (attachment) => {
    if (isArchived) {
      notify('归档证照无法修改附件')
      return
    }
    const prevDetail = { ...selectedLicense }
    try {
      await api.setAttachmentCurrent(attachment.id)
      await syncLicenseDetail(prevDetail)
      notify('已标记为当前有效版本')
      reload()
    } catch (error) {
      notify(error.message)
    }
  }

  const handleDeleteAttachment = async (attachment) => {
    if (isArchived) {
      notify('归档证照无法删除附件')
      return
    }
    if (!confirm(`确定要删除版本 v${attachment.version} 的附件吗？`)) return
    const prevDetail = { ...selectedLicense }
    try {
      await api.deleteAttachment(attachment.id)
      await syncLicenseDetail(prevDetail)
      notify('附件已删除')
      reload()
    } catch (error) {
      notify(error.message)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">License Registry</p>
          <h1>证照录入与台账</h1>
        </div>
        <button className="icon-button" type="button" onClick={reload} title="刷新">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="content-grid form-and-table">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-title">
            <Plus size={18} />
            <h2>新增证照</h2>
          </div>
          <div className="form-grid">
            <Field label="证照名称" value={form.name} onChange={(value) => setField('name', value)} required />
            <Field label="证照编号" value={form.license_no} onChange={(value) => setField('license_no', value)} required />
            <SelectField label="证照类型" value={form.license_type} options={licenseTypes} onChange={(value) => setField('license_type', value)} />
            <Field label="发证机关" value={form.issuing_authority} onChange={(value) => setField('issuing_authority', value)} required />
            <Field label="归属部门" value={form.owner_department} onChange={(value) => setField('owner_department', value)} required />
            <Field label="保管人" value={form.keeper} onChange={(value) => setField('keeper', value)} />
            <Field label="发证日期" type="date" value={form.issue_date} onChange={(value) => setField('issue_date', value)} required />
            <Field label="到期日期" type="date" value={form.expiry_date} onChange={(value) => setField('expiry_date', value)} required />
            <Field label="提醒天数" type="number" value={form.reminder_days} onChange={(value) => setField('reminder_days', Number(value))} required />
            <SelectField label="状态" value={form.status} options={licenseStatuses} onChange={(value) => setField('status', value)} />
          </div>
          <label className="field full">
            <span>备注</span>
            <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} />
          </label>
          <button className="primary-button" disabled={saving} type="submit">
            <Save size={17} />
            <span>{saving ? '保存中' : '保存证照'}</span>
          </button>
        </form>

        <div className="panel table-panel">
          <div className="table-toolbar">
            <input placeholder="搜索名称、编号、机关、部门" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">全部状态</option>
              {licenseStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {filteredLicenses.length ? (
            <div className="data-table">
              <div className="table-head license-row">
                <span>证照</span>
                <span>部门</span>
                <span>到期</span>
                <span>状态</span>
                <span>附件</span>
              </div>
              {filteredLicenses.map((item) => (
                <div
                  className={`table-row license-row clickable ${selectedLicense?.id === item.id ? 'selected' : ''}`}
                  key={item.id}
                  onClick={() => handleLicenseClick(item)}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.license_no}</span>
                  </div>
                  <span>{item.owner_department}</span>
                  <span>{item.expiry_date}</span>
                  <StatusBadge status={item.computed_status} />
                  {(() => {
                    const count = item.attachment_count ?? 0
                    if (count === 0) {
                      return (
                        <span className="attachment-count zero" title="暂无扫描件附件">
                          <FileText size={14} />
                          无附件
                        </span>
                      )
                    }
                    return (
                      <span className="attachment-count" title={`共 ${count} 份扫描件附件`}>
                        <FileText size={14} />
                        {count} 份
                      </span>
                    )
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无证照" description="请先录入企业证照信息。" />
          )}
        </div>
      </div>

      {selectedLicense && (
        <div className="detail-overlay" onClick={closeDetail}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <button className="icon-button" type="button" onClick={closeDetail} title="关闭">
                <ChevronLeft size={18} />
              </button>
              <div className="detail-title">
                <h2>{selectedLicense.name}</h2>
                <span className="license-no">{selectedLicense.license_no}</span>
              </div>
              <div className="detail-status">
                {isArchived && (
                  <span className="archived-tag">
                    <Archive size={14} /> 已归档
                  </span>
                )}
                <StatusBadge status={selectedLicense.computed_status} />
              </div>
            </div>

            <div className="detail-body">
              <section className="detail-section">
                <h3>证照信息</h3>
                <div className="info-grid">
                  <InfoItem label="证照类型" value={selectedLicense.license_type_display} />
                  <InfoItem label="发证机关" value={selectedLicense.issuing_authority} />
                  <InfoItem label="归属部门" value={selectedLicense.owner_department} />
                  <InfoItem label="保管人" value={selectedLicense.keeper || '-'} />
                  <InfoItem label="发证日期" value={selectedLicense.issue_date} />
                  <InfoItem label="到期日期" value={selectedLicense.expiry_date} />
                  <InfoItem label="提前提醒" value={`${selectedLicense.reminder_days} 天`} />
                  <InfoItem label="剩余天数" value={`${selectedLicense.days_until_expiry} 天`} />
                </div>
                {selectedLicense.notes && (
                  <div className="notes-block">
                    <strong>备注：</strong>
                    <p>{selectedLicense.notes}</p>
                  </div>
                )}
              </section>

              <section className="detail-section">
                <div className="section-header">
                  <h3>
                    <FileText size={16} />
                    证照附件管理
                  </h3>
                  {isArchived && <span className="readonly-tip">归档证照 - 只读模式</span>}
                </div>

                {!isArchived && (
                  <div className="upload-area">
                    <div className="upload-form">
                      <Field label="版本说明" value={uploadDesc} onChange={setUploadDesc} placeholder="如：2024年度年检更新" />
                      <Field label="上传人" value={uploadedBy} onChange={setUploadedBy} placeholder="请输入上传人姓名" />
                    </div>
                    <button className="primary-button upload-btn" type="button" onClick={handleFileSelect} disabled={uploading}>
                      <Upload size={17} />
                      <span>{uploading ? '上传中...' : '上传扫描件'}</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff,.doc,.docx" style={{ display: 'none' }} onChange={handleFileUpload} />
                    <p className="upload-hint">支持 PDF、JPG、PNG、Word 等格式，单个文件不超过 50MB</p>
                  </div>
                )}

                <div className="attachments-list">
                  {(selectedLicense.attachments || []).length ? (
                    (selectedLicense.attachments || []).map((att) => (
                      <div key={att.id} className={`attachment-item ${att.is_current ? 'current' : ''} ${isArchived ? 'readonly' : ''}`}>
                        <div className="attachment-icon">
                          <FileText size={24} />
                        </div>
                        <div className="attachment-info">
                          <div className="attachment-head">
                            <span className="attachment-version">v{att.version}</span>
                            {att.is_current && (
                              <span className="current-badge">
                                <Star size={12} fill="currentColor" /> 当前有效
                              </span>
                            )}
                            <span className="attachment-filename" title={att.file_name}>{att.file_name}</span>
                          </div>
                          <div className="attachment-meta">
                            <span>{formatFileSize(att.file_size)}</span>
                            <span>·</span>
                            <span>{formatDate(att.created_at)}</span>
                            <span>·</span>
                            <span>上传人：{att.uploaded_by || '系统'}</span>
                          </div>
                          {att.description && (
                            <div className="attachment-desc">
                              <span>版本说明：</span>{att.description}
                            </div>
                          )}
                        </div>
                        <div className="attachment-actions">
                          <a className="icon-button" href={att.file_url} target="_blank" rel="noopener noreferrer" title="查看/下载">
                            <Download size={16} />
                          </a>
                          {!isArchived && !att.is_current && (
                            <button className="icon-button primary" type="button" onClick={() => handleSetCurrent(att)} title="设为当前有效">
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          {!isArchived && (
                            <button className="icon-button danger" type="button" onClick={() => handleDeleteAttachment(att)} title="删除">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="暂无附件"
                      description={isArchived ? '该证照暂无扫描件附件。' : '请上传证照扫描件作为附件存档。'}
                      compact
                    />
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />
    </label>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  )
}
