(() => {
  'use strict';

  const SUBJECTS = [
    { key: 'english', label: 'English' },
    { key: 'urdu', label: 'Urdu' },
    { key: 'subjectThree', label: 'Biology / Mathematics / Psychology' },
    { key: 'subjectFour', label: 'Computer / Chemistry / Statistics' },
    { key: 'subjectFive', label: 'Physics / Civics' },
    { key: 'quran', label: 'T.Q. (Tarjuma-tul-Quran)' },
    { key: 'islamiat', label: 'Islamiat' }
  ];

  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path.startsWith('/api/admin/')) {
        window.location.href = 'login.html';
      }
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  function statusClass(status) {
    return status === 'Pass' ? 'status-pass' : status === 'Fail' ? 'status-fail' : 'status-pending';
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function setMessage(element, text, isError = true) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('message-success', !isError && Boolean(text));
  }

  function calculateSummary(totalValue, obtainedValue, marks, passPercentage) {
    const total = totalValue === null || totalValue === undefined || totalValue === '' ? null : Number(totalValue);
    const obtained = obtainedValue === null || obtainedValue === undefined || obtainedValue === '' ? null : Number(obtainedValue);
    const subjects = SUBJECTS.map((subject) => ({
      ...subject,
      total: marks[subject.key]?.total ?? null,
      obtained: marks[subject.key]?.obtained ?? null
    }));
    const incompleteSubject = subjects.some((subject) =>
      (subject.total === null) !== (subject.obtained === null)
    );
    const invalidSubject = subjects.some((subject) =>
      subject.total !== null && (Number(subject.total) <= 0 || Number(subject.obtained) > Number(subject.total))
    );
    const percentage = total !== null && obtained !== null && total > 0
      ? (obtained / total) * 100
      : null;
    const subjectFail = subjects.some((subject) =>
      subject.total !== null &&
      (Number(subject.obtained) / Number(subject.total)) * 100 < passPercentage
    );
    const status = percentage === null || incompleteSubject || invalidSubject
      ? 'Pending'
      : obtained > total || subjectFail || percentage < passPercentage
        ? 'Fail'
        : 'Pass';
    return { percentage, status };
  }

  function renderMarksheet(record, container) {
    const detail = (label, value) =>
      `<div class="detail-item"><span>${label}</span><strong>${escapeHTML(value || '—')}</strong></div>`;
    const subjectRows = SUBJECTS.map((subject) => {
      const marks = record.marks?.[subject.key] || {};
      const total = marks.total === null || marks.total === undefined ? '' : formatNumber(Number(marks.total));
      const obtained = marks.obtained === null || marks.obtained === undefined ? '' : formatNumber(Number(marks.obtained));
      return `<tr><td>${escapeHTML(subject.label)}</td><td>${escapeHTML(total)}</td><td>${escapeHTML(obtained)}</td></tr>`;
    }).join('');
    const totalMarks = record.totalMarks === null || record.totalMarks === undefined ? '' : formatNumber(Number(record.totalMarks));
    const obtainedMarks = record.obtainedMarks === null || record.obtainedMarks === undefined ? '' : formatNumber(Number(record.obtainedMarks));
    const percentage = record.percentage === null || record.percentage === undefined ? '' : `${formatNumber(Number(record.percentage))}%`;
    const status = record.resultStatus || 'Pending';

    container.innerHTML = `
      <div class="marksheet-head">
        <div class="marksheet-brand">
          <img class="brand-mark" src="assets/college-logo.png" alt="">
          <div><h2>Punjab NastonAL College</h2><p>Peshawar Chapter</p></div>
        </div>
        <span class="marksheet-label">OFFICIAL MARKSHEET</span>
      </div>
      <h2 class="marksheet-title">STUDENT RESULT</h2>
      <div class="student-details">
        ${detail('Name', record.name)}
        ${detail('Father Name', record.fatherName)}
        ${detail('Roll Number', record.rollNumber)}
        ${detail('Class', record.className)}
        ${detail('Section', record.section)}
        ${detail('Date', record.date)}
      </div>
      <table class="marks-table">
        <thead><tr><th>Subject</th><th>Total Marks</th><th>Obtained Marks</th></tr></thead>
        <tbody>${subjectRows}</tbody>
      </table>
      <div class="marksheet-summary">
        <div class="marksheet-stat"><span>Total Marks</span><strong>${escapeHTML(totalMarks)}</strong></div>
        <div class="marksheet-stat"><span>Obtained Marks</span><strong>${escapeHTML(obtainedMarks)}</strong></div>
        <div class="marksheet-stat"><span>Percentage</span><strong>${escapeHTML(percentage)}</strong></div>
        <div class="marksheet-stat"><span>Result Status</span><strong><span class="status-pill ${statusClass(status)}">${escapeHTML(status)}</span></strong></div>
      </div>
      ${record.remarks ? `<p class="marksheet-remarks"><strong>Remarks:</strong> ${escapeHTML(record.remarks)}</p>` : ''}
      <div class="marksheet-actions"><button type="button" class="button button-primary" data-print-result>Print Result <span aria-hidden="true">⎙</span></button></div>`;
    container.querySelector('[data-print-result]')?.addEventListener('click', () => window.print());
  }

  const page = document.body.dataset.page;

  if (page === 'results') {
    const trigger = document.querySelector('.menu-trigger');
    const menu = document.querySelector('#access-menu');
    trigger?.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!expanded));
      if (menu) menu.hidden = expanded;
    });
    document.addEventListener('click', (event) => {
      if (menu && trigger && !menu.hidden && !trigger.contains(event.target) && !menu.contains(event.target)) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu && trigger) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    const searchForm = document.querySelector('#result-search');
    const searchMessage = document.querySelector('#search-message');
    const marksheet = document.querySelector('#marksheet');
    const emptyState = document.querySelector('#empty-state');
    searchForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(searchMessage, '');
      const rollNumber = String(new FormData(searchForm).get('rollNumber') || '').trim();
      try {
        const record = await api(`/api/results?roll=${encodeURIComponent(rollNumber)}`);
        renderMarksheet(record, marksheet);
        marksheet.hidden = false;
        emptyState.hidden = true;
        marksheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        marksheet.hidden = true;
        emptyState.hidden = false;
        setMessage(searchMessage, error.message);
      }
    });
  }

  if (page === 'login') {
    const loginForm = document.querySelector('#login-form');
    const loginMessage = document.querySelector('#login-message');
    loginForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(loginMessage, '');
      const formData = new FormData(loginForm);
      try {
        await api('/api/session', {
          method: 'POST',
          body: JSON.stringify({
            username: String(formData.get('username') || '').trim(),
            password: String(formData.get('password') || '')
          })
        });
        window.location.href = 'admin.html';
      } catch (error) {
        setMessage(loginMessage, error.message);
        document.querySelector('#password')?.focus();
      }
    });
  }

  if (page === 'admin') {
    async function initializeAdmin() {
      const session = await api('/api/session');
      if (!session.authenticated) {
        window.location.replace('login.html');
        return;
      }

      const form = document.querySelector('#result-form');
      const formTitle = document.querySelector('#form-title');
      const recordIdInput = document.querySelector('#record-id');
      const saveButton = document.querySelector('#save-button');
      const updateButton = document.querySelector('#update-button');
      const saveMessage = document.querySelector('#save-message');
      const recordSearch = document.querySelector('#records-search');
      const recordsList = document.querySelector('#records-list');
      const recordsEmpty = document.querySelector('#records-empty');
      const recordCount = document.querySelector('#record-count');
      const passPercentageInput = document.querySelector('#pass-percentage');
      const criteriaMessage = document.querySelector('#criteria-message');
      let records = [];

      function getFormRecord() {
        const data = new FormData(form);
        const marks = {};
        SUBJECTS.forEach(({ key }) => {
          const total = data.get(`${key}Total`);
          const obtained = data.get(`${key}Obtained`);
          marks[key] = {
            total: total === null || total === '' ? null : Number(total),
            obtained: obtained === null || obtained === '' ? null : Number(obtained)
          };
        });
        const totalRaw = data.get('totalMarks');
        const obtainedRaw = data.get('obtainedMarks');
        const summary = calculateSummary(totalRaw, obtainedRaw, marks, Number(passPercentageInput.value));
        return {
          id: recordIdInput.value || crypto.randomUUID(),
          name: String(data.get('name')).trim(),
          fatherName: String(data.get('fatherName')).trim(),
          rollNumber: String(data.get('rollNumber')).trim(),
          className: String(data.get('className')).trim(),
          section: String(data.get('section')).trim(),
          date: String(data.get('date')).trim(),
          remarks: String(data.get('remarks')).trim(),
          marks,
          totalMarks: totalRaw === null || totalRaw === '' ? null : Number(totalRaw),
          obtainedMarks: obtainedRaw === null || obtainedRaw === '' ? null : Number(obtainedRaw),
          percentage: summary.percentage,
          resultStatus: summary.status
        };
      }

      function updateSummary() {
        const data = new FormData(form);
        const marks = {};
        SUBJECTS.forEach(({ key }) => {
          const total = data.get(`${key}Total`);
          const obtained = data.get(`${key}Obtained`);
          marks[key] = {
            total: total === null || total === '' ? null : Number(total),
            obtained: obtained === null || obtained === '' ? null : Number(obtained)
          };
        });
        const summary = calculateSummary(
          document.querySelector('#total-marks').value,
          document.querySelector('#obtained-marks').value,
          marks,
          Number(passPercentageInput.value)
        );
        document.querySelector('#percentage').textContent =
          summary.percentage === null ? '—' : `${formatNumber(summary.percentage)}%`;
        const status = document.querySelector('#result-status');
        status.textContent = summary.status;
        status.className = `status-pill ${statusClass(summary.status)}`;
      }

      async function renderRecords() {
        records = await api('/api/admin/results');
        const query = recordSearch.value.trim().toLocaleLowerCase();
        const visible = records.filter((record) =>
          record.name.toLocaleLowerCase().includes(query) ||
          record.rollNumber.toLocaleLowerCase().includes(query)
        );
        recordCount.textContent = String(records.length);
        recordsList.innerHTML = visible.map((record) => `
          <div class="record-item">
            <div class="record-info"><strong>${escapeHTML(record.name)}</strong><span>${escapeHTML(record.rollNumber)}</span></div>
            <div class="record-actions">
              <button type="button" data-edit-record="${escapeHTML(record.id)}">Edit</button>
              <button type="button" class="delete-record" data-delete-record="${escapeHTML(record.id)}" aria-label="Delete ${escapeHTML(record.name)}">Delete</button>
            </div>
          </div>`).join('');
        recordsEmpty.hidden = visible.length > 0;
        recordsEmpty.textContent = records.length === 0
          ? 'No saved results yet. Add a student record to get started.'
          : 'No results match your search.';
      }

      function resetEditor() {
        form.reset();
        recordIdInput.value = '';
        formTitle.textContent = 'Enter student result';
        saveButton.hidden = false;
        updateButton.hidden = true;
        setMessage(saveMessage, '');
        updateSummary();
      }

      function loadRecord(id) {
        const record = records.find((item) => item.id === id);
        if (!record) {
          setMessage(saveMessage, 'That result could not be found. Refresh the records list and try again.');
          return;
        }
        recordIdInput.value = record.id;
        const fields = {
          name: record.name,
          fatherName: record.fatherName,
          rollNumber: record.rollNumber,
          className: record.className,
          section: record.section,
          date: record.date,
          remarks: record.remarks
        };
        Object.entries(fields).forEach(([name, value]) => {
          form.elements.namedItem(name).value = value || '';
        });
        SUBJECTS.forEach(({ key }) => {
          const marks = record.marks?.[key] || {};
          form.elements.namedItem(`${key}Total`).value = marks.total ?? '';
          form.elements.namedItem(`${key}Obtained`).value = marks.obtained ?? '';
        });
        form.elements.namedItem('totalMarks').value = record.totalMarks ?? '';
        form.elements.namedItem('obtainedMarks').value = record.obtainedMarks ?? '';
        formTitle.textContent = `Editing ${record.name}`;
        saveButton.hidden = true;
        updateButton.hidden = false;
        setMessage(saveMessage, '');
        updateSummary();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      async function persistRecord(isUpdate) {
        if (!form.reportValidity()) return;
        const record = getFormRecord();
        const hasTotal = record.totalMarks !== null;
        const hasObtained = record.obtainedMarks !== null;
        if (hasTotal !== hasObtained) {
          setMessage(saveMessage, 'Enter both overall Total Marks and Obtained Marks, or leave both blank.');
          return;
        }
        if (hasTotal && record.totalMarks <= 0) {
          setMessage(saveMessage, 'Overall Total Marks must be greater than zero.');
          document.querySelector('#total-marks').focus();
          return;
        }
        if (hasTotal && record.obtainedMarks > record.totalMarks) {
          setMessage(saveMessage, 'Obtained Marks cannot be greater than Total Marks.');
          document.querySelector('#obtained-marks').focus();
          return;
        }
        for (const subject of SUBJECTS) {
          const marks = record.marks[subject.key];
          const hasSubjectTotal = marks.total !== null;
          const hasSubjectObtained = marks.obtained !== null;
          if (hasSubjectTotal !== hasSubjectObtained) {
            setMessage(saveMessage, `Enter both Total Marks and Obtained Marks for ${subject.label}, or leave both blank.`);
            document.querySelector(`[name="${subject.key}${hasSubjectTotal ? 'Obtained' : 'Total'}"]`).focus();
            return;
          }
          if (hasSubjectTotal && marks.total <= 0) {
            setMessage(saveMessage, `Total Marks for ${subject.label} must be greater than zero.`);
            document.querySelector(`[name="${subject.key}Total"]`).focus();
            return;
          }
          if (hasSubjectTotal && marks.obtained > marks.total) {
            setMessage(saveMessage, `Obtained Marks for ${subject.label} cannot be greater than its Total Marks.`);
            document.querySelector(`[name="${subject.key}Obtained"]`).focus();
            return;
          }
        }
        try {
          await api(isUpdate ? `/api/admin/results/${encodeURIComponent(record.id)}` : '/api/admin/results', {
            method: isUpdate ? 'PUT' : 'POST',
            body: JSON.stringify(record)
          });
          resetEditor();
          await renderRecords();
          setMessage(saveMessage, isUpdate ? 'Result updated successfully.' : 'Result saved successfully.', false);
        } catch (error) {
          setMessage(saveMessage, error.message);
        }
      }

      form.addEventListener('input', updateSummary);
      form.addEventListener('change', updateSummary);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void persistRecord(false);
      });
      updateButton.addEventListener('click', () => void persistRecord(true));
      recordSearch.addEventListener('input', () => {
        const query = recordSearch.value.trim().toLocaleLowerCase();
        const visible = records.filter((record) =>
          record.name.toLocaleLowerCase().includes(query) ||
          record.rollNumber.toLocaleLowerCase().includes(query)
        );
        recordsList.innerHTML = visible.map((record) => `
          <div class="record-item">
            <div class="record-info"><strong>${escapeHTML(record.name)}</strong><span>${escapeHTML(record.rollNumber)}</span></div>
            <div class="record-actions">
              <button type="button" data-edit-record="${escapeHTML(record.id)}">Edit</button>
              <button type="button" class="delete-record" data-delete-record="${escapeHTML(record.id)}" aria-label="Delete ${escapeHTML(record.name)}">Delete</button>
            </div>
          </div>`).join('');
        recordsEmpty.hidden = visible.length > 0;
        recordsEmpty.textContent = records.length === 0
          ? 'No saved results yet. Add a student record to get started.'
          : 'No results match your search.';
      });
      recordsList.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.editRecord) {
          loadRecord(button.dataset.editRecord);
          return;
        }
        if (button.dataset.deleteRecord) {
          const record = records.find((item) => item.id === button.dataset.deleteRecord);
          if (!record || !window.confirm(`Delete the result for ${record.name} (${record.rollNumber})? This cannot be undone.`)) return;
          try {
            await api(`/api/admin/results/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
            if (recordIdInput.value === record.id) resetEditor();
            setMessage(saveMessage, 'Result deleted.', false);
            await renderRecords();
          } catch (error) {
            setMessage(saveMessage, error.message);
          }
        }
      });
      document.querySelector('#clear-button').addEventListener('click', () => {
        window.setTimeout(resetEditor, 0);
      });
      passPercentageInput.addEventListener('change', async () => {
        if (!passPercentageInput.reportValidity()) return;
        try {
          const settings = await api('/api/admin/settings', {
            method: 'PUT',
            body: JSON.stringify({ passPercentage: Number(passPercentageInput.value) })
          });
          passPercentageInput.value = String(settings.passPercentage);
          setMessage(criteriaMessage, 'Passing criteria saved.', false);
          updateSummary();
        } catch (error) {
          setMessage(criteriaMessage, error.message);
        }
      });
      document.querySelector('#logout-button').addEventListener('click', async () => {
        try {
          await api('/api/session', { method: 'DELETE' });
          window.location.href = 'index.html';
        } catch (error) {
          setMessage(saveMessage, error.message);
        }
      });

      const [settings] = await Promise.all([
        api('/api/admin/settings'),
        renderRecords()
      ]);
      passPercentageInput.value = String(settings.passPercentage);
      updateSummary();
    }

    initializeAdmin().catch((error) => {
      setMessage(document.querySelector('#save-message'), error.message);
    });
  }
})();
