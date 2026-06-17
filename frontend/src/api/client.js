const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:18033/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }
  return response.json()
}

async function uploadRequest(path, formData, method = 'POST') {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    body: formData,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }
  return response.json()
}

export const api = {
  listLicenses: (params = {}) => request(`/licenses/?${new URLSearchParams(params)}`),
  createLicense: (data) => request('/licenses/', { method: 'POST', body: JSON.stringify(data) }),
  updateLicense: (id, data) => request(`/licenses/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
  getLicense: (id) => request(`/licenses/${id}/`),
  listBorrowRecords: (params = {}) => request(`/borrow-records/?${new URLSearchParams(params)}`),
  createBorrowRecord: (data) => request('/borrow-records/', { method: 'POST', body: JSON.stringify(data) }),
  updateBorrowRecord: (id, data) => request(`/borrow-records/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
  stats: () => request('/stats/'),
  listAttachments: (params = {}) => request(`/license-attachments/?${new URLSearchParams(params)}`),
  uploadAttachment: (formData) => uploadRequest('/license-attachments/', formData, 'POST'),
  updateAttachment: (id, data) => request(`/license-attachments/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
  patchAttachment: (id, data) => request(`/license-attachments/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  setAttachmentCurrent: (id) => request(`/license-attachments/${id}/set_current/`, { method: 'POST', body: JSON.stringify({}) }),
  deleteAttachment: (id) => request(`/license-attachments/${id}/`, { method: 'DELETE' }),
}
