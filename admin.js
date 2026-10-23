// ==========================================
// nunu 관리자 콘솔 - 독립 프로젝트 연동 엔진
// ==========================================
let API_BASE = localStorage.getItem("nunu_admin_api_base") || "http://localhost:8080";

function getApiUrl(path) {
  if (!API_BASE) return path;
  var base = API_BASE.replace(/\/+$/, "");
  return base + path;
}

function initAdminAuth() {
  try {
    sessionStorage.setItem("nunu_admin_auth", "true");
  } catch (e) {}
  const overlay = document.getElementById("adminAuthOverlay");
  if (overlay) {
    overlay.style.display = "none";
    overlay.remove();
  }
}

function initServerConfig() {
  const btnConfig = document.getElementById("btnConfigApiServer");
  const modal = document.getElementById("serverConfigModal");
  const closeBtn = document.getElementById("closeServerConfigModalBtn");
  const input = document.getElementById("serverUrlInput");
  const saveBtn = document.getElementById("btnSaveServerUrl");
  const btnSetLocal = document.getElementById("btnSetLocalServer");
  const btnSetTunnel = document.getElementById("btnSetTunnelServer");
  const label = document.getElementById("apiServerLabel");
  const openPortalBtn = document.getElementById("btnOpenUserPortal");

  const updateLabel = () => {
    if (label) label.textContent = `연동 서버: ${API_BASE || '현재 호스트'}`;
    if (openPortalBtn) openPortalBtn.href = API_BASE ? API_BASE : "http://localhost:8080/";
  };
  updateLabel();

  if (btnConfig) {
    btnConfig.addEventListener("click", () => {
      if (input) input.value = API_BASE;
      if (modal) modal.style.display = "flex";
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }
  if (btnSetLocal && input) {
    btnSetLocal.addEventListener("click", () => {
      input.value = "http://localhost:8080";
    });
  }
  if (btnSetTunnel && input) {
    btnSetTunnel.addEventListener("click", () => {
      input.value = "https://months-wrestling-colony-concerning.trycloudflare.com";
    });
  }
  if (saveBtn && input) {
    saveBtn.addEventListener("click", () => {
      let val = input.value.trim().replace(/\/+$/, "");
      API_BASE = val;
      localStorage.setItem("nunu_admin_api_base", val);
      updateLabel();
      if (modal) modal.style.display = "none";
      alert(`✅ 연동 서버가 [${val}] 로 설정되었습니다. 실시간 동기화를 시작합니다.`);
      initAdminApp();
    });
  }
}

/**
 * nunu Admin Console Application Logic
 */

let allUsers = [];
let isAllPwVisible = false;
let individualPwVisible = {}; // id -> boolean
let editingTargetUserId = null;
let currentDailyLimit = 20;
let creditTargetUser = null; // { id, name, credits }

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initAdminApp() {
  try { initAdminAuth(); } catch(e) {}
  try { initServerConfig(); } catch(e) {}
  try { initEmergencyControl(); } catch (e) { console.error("Emergency control error:", e); }
  try { loadUsers(); } catch (e) { console.error(e); }
  try { loadAdminAds(); } catch (e) { console.error(e); }
  try { loadTalosTests(); } catch (e) { console.error(e); }
  try { initEventListeners(); } catch (e) { console.error(e); }
  try { initAdsManager(); } catch (e) { console.error(e); }
  try { initTalosManager(); } catch (e) { console.error(e); }

  // 2초마다 실시간 자동 동기화 (새로운 회원가입 시 새로고침 없이 즉시 반영!)
  setInterval(() => {
    try { loadUsers(true); } catch (e) {}
  }, 2000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminApp);
} else {
  initAdminApp();
}

// ==========================================
// 1. 데이터 로드 및 저장 (API 우선 연동)
// ==========================================
async function loadUsers(silent = false) {
  try {
    const res = await fetch(getApiUrl("/api/users?t=" + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        allUsers = data.users;
        if (data.dailyLimit !== undefined) {
          currentDailyLimit = data.dailyLimit;
        }
        localStorage.setItem("nunu_users", JSON.stringify(allUsers));
        renderDashboard();
        return;
      }
    }
  } catch (err) {
    // 백엔드 미구동 시 로컬스토리지 fallback
  }

  try {
    const cfgRes = await fetch(getApiUrl("/api/credits/config?t=" + Date.now());
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg.success) currentDailyLimit = cfg.dailyLimit;
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem("nunu_users");
    allUsers = raw ? JSON.parse(raw) : [];
  } catch {
    allUsers = [];
  }
  renderDashboard();
}

function saveUsers(users) {
  localStorage.setItem("nunu_users", JSON.stringify(users));
  allUsers = users;
  renderDashboard();
}

// ==========================================
// 2. 대시보드 및 테이블 렌더링
// ==========================================
function renderDashboard() {
  updateMetrics();
  renderUserTable();
}

function updateMetrics() {
  const totalCountEl = document.getElementById("totalUsersCount");
  const recentUserEl = document.getElementById("recentUserText");
  const proCountEl = document.getElementById("proUsersCount");
  const dailyLimitEl = document.getElementById("dailyLimitMetricText");
  const dailyLimitInput = document.getElementById("dailyCreditLimitInput");

  if (totalCountEl) {
    totalCountEl.textContent = `${allUsers.length}명`;
  }

  if (proCountEl) {
    const proUsers = allUsers.filter(u => Boolean(u.isPro));
    proCountEl.textContent = `${proUsers.length}명`;
  }

  if (dailyLimitEl) {
    dailyLimitEl.textContent = `${currentDailyLimit}개`;
  }
  if (dailyLimitInput && !dailyLimitInput.matches(":focus")) {
    dailyLimitInput.value = currentDailyLimit;
  }

  if (recentUserEl) {
    if (allUsers.length > 0) {
      const newestUser = allUsers[0]; // 최신 가입자가 1순위
      recentUserEl.textContent = `${newestUser.name} (${newestUser.id})`;
    } else {
      recentUserEl.textContent = "없음";
    }
  }
}

function renderUserTable() {
  const tbody = document.getElementById("userTableBody");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("userSearchInput");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!tbody) return;

  // 검색 필터링
  const filtered = allUsers.filter(u => {
    return (
      u.id.toLowerCase().includes(query) ||
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = filtered.map((u, index) => {
    const isVisible = isAllPwVisible || individualPwVisible[u.id];
    const displayPw = isVisible ? u.password : "••••••••";
    const dateStr = u.createdAt ? formatDateTime(u.createdAt) : "기본 계정";
    const isPro = Boolean(u.isPro);
    const credits = u.credits !== undefined ? u.credits : 20;

    return `
      <tr>
        <td style="color: var(--text-muted); font-weight: 600;">${index + 1}</td>
        <td><span class="badge-id">${escapeHtml(u.id)}</span></td>
        <td><strong>${escapeHtml(u.name || "-")}</strong></td>
        <td><span style="color: var(--text-sub);">${escapeHtml(u.email || "-")}</span></td>
        <td>
          <div class="pw-cell-box">
            <span class="pw-code" id="pwText_${u.id}">${escapeHtml(displayPw)}</span>
            <button class="pw-toggle-btn" data-id="${u.id}" title="${isVisible ? '비밀번호 숨기기' : '비밀번호 확인'}">
              <i class="fa-solid ${isVisible ? 'fa-eye-slash' : 'fa-eye'}"></i>
            </button>
            <button class="pw-copy-btn" data-pw="${escapeHtml(u.password)}" title="비밀번호 복사">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </td>
        <td style="text-align: center;">
          <button class="btn-pro-toggle ${isPro ? 'is-pro' : 'is-standard'}" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="${isPro ? 'PRO 권한 해제' : 'PRO 권한 부여'}">
            <i class="fa-solid ${isPro ? 'fa-crown' : 'fa-bolt'}"></i>
            <span>${isPro ? 'PRO 승인' : '일반 AI'}</span>
          </button>
        </td>
        <td style="text-align: center;">
          <div class="credit-cell-box">
            <span class="badge-credit"><i class="fa-solid fa-coins"></i> ${credits}</span>
            <button class="btn-credit-manage" data-id="${u.id}" data-name="${escapeHtml(u.name)}" data-credits="${credits}" title="크레딧 지급 또는 차감">
              <i class="fa-solid fa-sliders"></i> 조절
            </button>
          </div>
        </td>
        <td style="text-align: center;">
          <button class="btn-user-ads-toggle ${u.adsEnabled !== false ? 'is-on' : 'is-off'}" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="${u.adsEnabled !== false ? '이 회원 광고 끄기(OFF)' : '이 회원 광고 켜기(ON)'}">
            <i class="fa-solid ${u.adsEnabled !== false ? 'fa-eye' : 'fa-eye-slash'}"></i>
            <span>${u.adsEnabled !== false ? '광고 ON' : '광고 OFF'}</span>
          </button>
        </td>
        <td style="font-size: 13px; color: var(--text-muted);">${dateStr}</td>
        <td>
          <div class="action-buttons">
            <button class="btn-edit-pw" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="비밀번호 수정">
              <i class="fa-solid fa-pen"></i> 수정
            </button>
            <button class="btn-delete-user" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="회원 삭제">
              <i class="fa-solid fa-trash"></i> 삭제
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // 이벤트 바인딩
  bindTableEvents();
}

function bindTableEvents() {
  // PRO 권한 토글 이벤트
  document.querySelectorAll(".btn-pro-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      btn.disabled = true;

      try {
        const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(id)}/toggle-pro`, {
          method: "POST"
        });
        const data = await res.json();
        if (data.success) {
          const user = allUsers.find(u => u.id === id);
          if (user) {
            user.isPro = data.isPro;
          }
          // 브라우저 캐시 동기화
          localStorage.setItem("nunu_users", JSON.stringify(allUsers));
          try {
            const curUser = JSON.parse(localStorage.getItem("nunu_current_user"));
            if (curUser && curUser.id === id) {
              curUser.isPro = data.isPro;
              localStorage.setItem("nunu_current_user", JSON.stringify(curUser));
            }
          } catch (e) {}

          renderDashboard();
        } else {
          alert(data.message || "PRO 권한 변경 실패");
          btn.disabled = false;
        }
      } catch (err) {
        alert("네트워크 오류: " + err.message);
        btn.disabled = false;
      }
    });
  });

  // 개인(계정별) 광고 ON/OFF 토글 이벤트
  document.querySelectorAll(".btn-user-ads-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      btn.disabled = true;

      try {
        const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(id)}/toggle-ads`, {
          method: "POST"
        });
        const data = await res.json();
        if (data.success) {
          const user = allUsers.find(u => u.id === id);
          if (user) {
            user.adsEnabled = data.adsEnabled;
          }
          localStorage.setItem("nunu_users", JSON.stringify(allUsers));
          try {
            const curUser = JSON.parse(localStorage.getItem("nunu_current_user"));
            if (curUser && curUser.id === id) {
              curUser.adsEnabled = data.adsEnabled;
              localStorage.setItem("nunu_current_user", JSON.stringify(curUser));
            }
          } catch (e) {}

          renderUserTable();
        } else {
          alert(data.message || "개인 광고 상태 변경 실패");
          btn.disabled = false;
        }
      } catch (err) {
        alert("네트워크 오류: " + err.message);
        btn.disabled = false;
      }
    });
  });

  // 개별 비밀번호 보기 토글
  document.querySelectorAll(".pw-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      individualPwVisible[id] = !individualPwVisible[id];
      renderUserTable();
    });
  });

  // 비밀번호 클립보드 복사
  document.querySelectorAll(".pw-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pw = btn.dataset.pw;
      navigator.clipboard.writeText(pw).then(() => {
        alert("비밀번호가 클립보드에 복사되었습니다: " + pw);
      }).catch(() => {
        alert("복사 실패. 비밀번호: " + pw);
      });
    });
  });

  // 비밀번호 수정 모달 열기
  document.querySelectorAll(".btn-edit-pw").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      openEditPwModal(id, name);
    });
  });

  // 회원 삭제
  document.querySelectorAll(".btn-delete-user").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (confirm(`정말로 회원 [${name} (${id})] 계정을 삭제하시겠습니까?\n삭제 시 해당 회원은 포털에 로그인할 수 없습니다.`)) {
        deleteUser(id);
      }
    });
  });

  // 개별 크레딧 관리 모달 열기
  document.querySelectorAll(".btn-credit-manage").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const credits = Number(btn.dataset.credits || 0);
      openSingleCreditModal(id, name, credits);
    });
  });
}

function openSingleCreditModal(id, name, credits) {
  creditTargetUser = { id, name, credits };
  const modal = document.getElementById("singleCreditModal");
  const userText = document.getElementById("creditTargetUserText");
  const valText = document.getElementById("creditTargetCurrentVal");
  const amountInput = document.getElementById("singleCreditAmountInput");

  if (userText) userText.textContent = `${name} (${id})`;
  if (valText) valText.textContent = credits;
  if (amountInput) {
    amountInput.value = "10";
    amountInput.focus();
  }
  if (modal) modal.style.display = "flex";
}

function closeSingleCreditModal() {
  const modal = document.getElementById("singleCreditModal");
  if (modal) modal.style.display = "none";
  creditTargetUser = null;
}

function openBatchCreditModal() {
  const modal = document.getElementById("batchCreditModal");
  const span = document.getElementById("batchUsersCountSpan");
  const amountInput = document.getElementById("batchCreditAmountInput");

  if (span) span.textContent = `${allUsers.length}명`;
  if (amountInput) {
    amountInput.value = "20";
    amountInput.focus();
  }
  if (modal) modal.style.display = "flex";
}

function closeBatchCreditModal() {
  const modal = document.getElementById("batchCreditModal");
  if (modal) modal.style.display = "none";
}

// ==========================================
// 3. 계정 삭제 및 비밀번호 수정 로직
// ==========================================
async function deleteUser(id) {
  try {
    const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await res.json();
    if (!res.ok || !result.success) {
      alert(result.message || "삭제 실패");
      return;
    }
  } catch (err) {
    // 오프라인 fallback
  }

  const updated = allUsers.filter(u => u.id !== id);
  saveUsers(updated);

  // 현재 포털 로그인 세션이 삭제된 유저인 경우 로그아웃 처리
  try {
    const cur = JSON.parse(localStorage.getItem("nunu_current_user"));
    if (cur && cur.id === id) {
      localStorage.removeItem("nunu_current_user");
    }
  } catch {}

  alert("회원 계정이 성공적으로 삭제되었습니다.");
}

function openEditPwModal(id, name) {
  editingTargetUserId = id;
  const modal = document.getElementById("editPwModal");
  const targetSpan = document.getElementById("targetUserSpan");
  const input = document.getElementById("editPwInput");

  const target = allUsers.find(u => u.id === id);
  if (targetSpan) targetSpan.textContent = `${name} (${id})`;
  if (input) {
    input.value = target ? target.password : "";
    input.focus();
  }
  if (modal) modal.style.display = "flex";
}

// ==========================================
// 4. 모달 및 헤더 이벤트 리스너
// ==========================================
function initEventListeners() {
  const refreshBtn = document.getElementById("refreshBtn");
  const searchInput = document.getElementById("userSearchInput");
  const toggleAllPwBtn = document.getElementById("toggleAllPwBtn");
  const pwModeText = document.getElementById("pwModeText");

  // 매일 기본 크레딧 한도 저장 버튼
  const btnSaveDailyLimit = document.getElementById("btnSaveDailyLimit");
  if (btnSaveDailyLimit) {
    btnSaveDailyLimit.addEventListener("click", async () => {
      const input = document.getElementById("dailyCreditLimitInput");
      const limitVal = parseInt(input ? input.value : 20, 10);
      if (isNaN(limitVal) || limitVal < 1) {
        alert("1 이상의 숫자를 입력해주세요.");
        return;
      }

      btnSaveDailyLimit.disabled = true;
      try {
        const res = await fetch(getApiUrl("/api/credits/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dailyLimit: limitVal })
        });
        const data = await res.json();
        if (data.success) {
          currentDailyLimit = data.dailyLimit;
          updateMetrics();
          alert(`✅ ${data.message}`);
        } else {
          alert(data.message || "한도 저장 실패");
        }
      } catch (e) {
        alert("네트워크 오류: " + e.message);
      } finally {
        btnSaveDailyLimit.disabled = false;
      }
    });
  }

  // 개별 크레딧 모달 버튼들
  const closeSingleCreditBtn = document.getElementById("closeSingleCreditModalBtn");
  const btnApplyGrantCredit = document.getElementById("btnApplyGrantCredit");
  const btnApplyDeductCredit = document.getElementById("btnApplyDeductCredit");

  if (closeSingleCreditBtn) closeSingleCreditBtn.addEventListener("click", closeSingleCreditModal);

  const handleSingleCredit = async (isGrant) => {
    if (!creditTargetUser) return;
    const input = document.getElementById("singleCreditAmountInput");
    const amountVal = Math.abs(parseInt(input ? input.value : 0, 10));
    if (isNaN(amountVal) || amountVal <= 0) {
      alert("1 이상의 올바른 수량을 입력해주세요.");
      return;
    }

    const finalAmount = isGrant ? amountVal : -amountVal;
    try {
      const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(creditTargetUser.id)}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: finalAmount })
      });
      const data = await res.json();
      if (data.success) {
        const u = allUsers.find(user => user.id === creditTargetUser.id);
        if (u) u.credits = data.credits;
        saveUsers(allUsers);

        // 현재 로그인 계정과 일치하면 브라우저 캐시 동기화
        try {
          const curUser = JSON.parse(localStorage.getItem("nunu_current_user"));
          if (curUser && curUser.id === creditTargetUser.id) {
            curUser.credits = data.credits;
            localStorage.setItem("nunu_current_user", JSON.stringify(curUser));
          }
        } catch(e) {}

        closeSingleCreditModal();
        alert(`✅ ${data.message}`);
      } else {
        alert(data.message || "크레딧 변경 실패");
      }
    } catch (e) {
      alert("네트워크 오류: " + e.message);
    }
  };

  if (btnApplyGrantCredit) btnApplyGrantCredit.addEventListener("click", () => handleSingleCredit(true));
  if (btnApplyDeductCredit) btnApplyDeductCredit.addEventListener("click", () => handleSingleCredit(false));

  // 전체 회원 일괄 크레딧 모달 버튼들
  const btnOpenBatchCredit = document.getElementById("btnOpenBatchCreditModal");
  const closeBatchCreditBtn = document.getElementById("closeBatchCreditModalBtn");
  const btnApplyBatchGrant = document.getElementById("btnApplyBatchGrant");
  const btnApplyBatchDeduct = document.getElementById("btnApplyBatchDeduct");

  if (btnOpenBatchCredit) btnOpenBatchCredit.addEventListener("click", openBatchCreditModal);
  if (closeBatchCreditBtn) closeBatchCreditBtn.addEventListener("click", closeBatchCreditModal);

  const handleBatchCredit = async (isGrant) => {
    const input = document.getElementById("batchCreditAmountInput");
    const amountVal = Math.abs(parseInt(input ? input.value : 0, 10));
    if (isNaN(amountVal) || amountVal <= 0) {
      alert("1 이상의 올바른 수량을 입력해주세요.");
      return;
    }

    const actionText = isGrant ? "지급" : "차감";
    if (!confirm(`정말로 등록된 모든 회원(${allUsers.length}명)에게 ${amountVal} 크레딧을 일괄 ${actionText}하시겠습니까?`)) {
      return;
    }

    const finalAmount = isGrant ? amountVal : -amountVal;
    try {
      const res = await fetch(getApiUrl("/api/users/credits/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: finalAmount })
      });
      const data = await res.json();
      if (data.success) {
        closeBatchCreditModal();
        await loadUsers(); // 최신 상태 재로드
        alert(`🎉 ${data.message}`);
      } else {
        alert(data.message || "일괄 처리 실패");
      }
    } catch (e) {
      alert("네트워크 오류: " + e.message);
    }
  };

  if (btnApplyBatchGrant) btnApplyBatchGrant.addEventListener("click", () => handleBatchCredit(true));
  if (btnApplyBatchDeduct) btnApplyBatchDeduct.addEventListener("click", () => handleBatchCredit(false));

  // 새로고침
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadUsers();
      alert("회원 목록을 새로고침했습니다.");
    });
  }

  // 검색
  if (searchInput) {
    searchInput.addEventListener("input", renderUserTable);
  }

  // 전체 비밀번호 표시/숨김 토글
  if (toggleAllPwBtn) {
    toggleAllPwBtn.addEventListener("click", () => {
      isAllPwVisible = !isAllPwVisible;
      if (isAllPwVisible) {
        toggleAllPwBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> 비밀번호 전체 숨김`;
        if (pwModeText) pwModeText.textContent = "전체 노출 중";
      } else {
        toggleAllPwBtn.innerHTML = `<i class="fa-solid fa-eye"></i> 비밀번호 전체 표시`;
        if (pwModeText) pwModeText.textContent = "전체 확인 가능";
      }
      renderUserTable();
    });
  }

  // 신규 회원 등록 모달
  const addUserModal = document.getElementById("addUserModal");
  const openAddUserModalBtn = document.getElementById("openAddUserModalBtn");
  const closeAddUserModalBtn = document.getElementById("closeAddUserModalBtn");
  const cancelAddUserBtn = document.getElementById("cancelAddUserBtn");
  const saveNewUserBtn = document.getElementById("saveNewUserBtn");

  const openAddModal = () => {
    if (addUserModal) {
      document.getElementById("addUserForm").reset();
      addUserModal.style.display = "flex";
      document.getElementById("newUserId").focus();
    }
  };
  const closeAddModal = () => {
    if (addUserModal) addUserModal.style.display = "none";
  };

  if (openAddUserModalBtn) openAddUserModalBtn.addEventListener("click", openAddModal);
  if (closeAddUserModalBtn) closeAddUserModalBtn.addEventListener("click", closeAddModal);
  if (cancelAddUserBtn) cancelAddUserBtn.addEventListener("click", closeAddModal);

  if (saveNewUserBtn) {
    saveNewUserBtn.addEventListener("click", async () => {
      const id = document.getElementById("newUserId").value.trim();
      const name = document.getElementById("newUserName").value.trim();
      const email = document.getElementById("newUserEmail").value.trim();
      const pw = document.getElementById("newUserPw").value.trim();

      if (!id || !name || !email || !pw) {
        alert("모든 필드를 입력해주세요.");
        return;
      }

      try {
        const res = await fetch(getApiUrl("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name, email, password: pw })
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          alert(result.message || "등록 실패");
          return;
        }
      } catch (err) {
        if (allUsers.some(u => u.id.toLowerCase() === id.toLowerCase())) {
          alert("이미 존재하는 아이디입니다.");
          return;
        }
      }

      const newUser = {
        id,
        name,
        email,
        password: pw,
        credits: currentDailyLimit,
        createdAt: new Date().toISOString()
      };

      allUsers.push(newUser);
      saveUsers(allUsers);
      closeAddModal();
      alert(`[${name}] 회원이 성공적으로 등록되었습니다!`);
    });
  }

  // 비밀번호 수정 모달
  const editPwModal = document.getElementById("editPwModal");
  const closeEditPwModalBtn = document.getElementById("closeEditPwModalBtn");
  const cancelEditPwBtn = document.getElementById("cancelEditPwBtn");
  const saveEditPwBtn = document.getElementById("saveEditPwBtn");

  const closeEditModal = () => {
    if (editPwModal) editPwModal.style.display = "none";
    editingTargetUserId = null;
  };

  if (closeEditPwModalBtn) closeEditPwModalBtn.addEventListener("click", closeEditModal);
  if (cancelEditPwBtn) cancelEditPwBtn.addEventListener("click", closeEditModal);

  if (saveEditPwBtn) {
    saveEditPwBtn.addEventListener("click", async () => {
      const newPw = document.getElementById("editPwInput").value.trim();
      if (!newPw) {
        alert("새 비밀번호를 입력해주세요.");
        return;
      }

      try {
        const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(editingTargetUserId)}/password`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newPw })
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          alert(result.message || "비밀번호 변경 실패");
          return;
        }
      } catch (err) {}

      const updated = allUsers.map(u => {
        if (u.id === editingTargetUserId) {
          return { ...u, password: newPw };
        }
        return u;
      });

      saveUsers(updated);
      closeEditModal();
      alert("비밀번호가 성공적으로 변경되었습니다.");
    });
  }

  // 모달 배경 클릭 닫기
  window.addEventListener("click", (e) => {
    if (e.target === addUserModal) closeAddModal();
    if (e.target === editPwModal) closeEditModal();
    const sModal = document.getElementById("singleCreditModal");
    if (e.target === sModal) closeSingleCreditModal();
    const bModal = document.getElementById("batchCreditModal");
    if (e.target === bModal) closeBatchCreditModal();
  });

  // AI 실시간 엔진 연동 관리 이벤트 바인딩
  initAiEngineConfig();
}

// ==========================================
// 5. AI 실시간 엔진 (Gemini Flash & PRO Pro) 설정 연동
// ==========================================
async function loadAiEngineConfig() {
  const badge = document.getElementById("adminEngineStatusBadge");
  const badgeText = document.getElementById("adminEngineStatusText");
  const input = document.getElementById("adminApiKeyInput");
  const alertEl = document.getElementById("adminApiKeyAlert");

  try {
    const res = await fetch(getApiUrl("/api/gemini/config");
    const data = await res.json();
    if (data.success) {
      if (data.hasKey) {
        if (badge) {
          badge.className = "engine-status-badge connected";
        }
        if (badgeText) {
          badgeText.textContent = `연동 완료 (${data.maskedKey})`;
        }
        if (input) {
          input.placeholder = `등록됨 (${data.maskedKey}) - 변경 시 새 키 입력`;
        }
      } else {
        if (badge) {
          badge.className = "engine-status-badge disconnected";
        }
        if (badgeText) {
          badgeText.textContent = "미연동 (API 키 등록 필요)";
        }
        if (input) {
          input.placeholder = "AIza... 로 시작하는 API 키를 입력하세요";
        }
      }
    }
  } catch (err) {
    if (badgeText) badgeText.textContent = "서버 확인 불가";
  }
}

function initAiEngineConfig() {
  loadAiEngineConfig();

  const input = document.getElementById("adminApiKeyInput");
  const toggleEye = document.getElementById("toggleAdminApiKeyVisible");
  const saveBtn = document.getElementById("btnSaveAdminApiKey");
  const testBtn = document.getElementById("btnTestAdminApiKey");
  const alertEl = document.getElementById("adminApiKeyAlert");

  const showAlert = (msg, type) => {
    if (!alertEl) return;
    alertEl.textContent = msg;
    alertEl.className = `admin-api-alert ${type}`;
    alertEl.style.display = "block";
    setTimeout(() => {
      // 7초 후 서서히 사라짐
      if (alertEl) alertEl.style.display = "none";
    }, 7000);
  };

  if (toggleEye && input) {
    toggleEye.addEventListener("click", () => {
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      toggleEye.innerHTML = isPass ? `<i class="fa-regular fa-eye-slash"></i>` : `<i class="fa-regular fa-eye"></i>`;
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const val = (input ? input.value : "").trim();
      if (!val) {
        showAlert("저장할 API 키를 입력해주세요 (AIza...)", "error");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...`;

      try {
        const res = await fetch(getApiUrl("/api/gemini/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: val })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(`✅ ${data.message} - 이제 기본 AI(Flash)와 PRO 엔진(Pro)이 Google 실시간 API로 작동합니다.`, "success");
          if (input) input.value = "";
          await loadAiEngineConfig();
        } else {
          showAlert(data.message || "저장 실패", "error");
        }
      } catch (err) {
        showAlert("네트워크 오류: " + err.message, "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> API 키 저장`;
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      testBtn.disabled = true;
      testBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 테스트 중...`;
      showAlert("Google AI 실시간 모델과 통신 테스트를 진행하는 중입니다...", "info");

      try {
        const res = await fetch(getApiUrl("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "Say 'Hello from nunu AI'",
            skipCreditDeduct: true
          })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(`✅ 실시간 Gemini 연동 성공! (응답 엔진: ${data.activeModel || 'Gemini 1.5 Flash'}) - 정상 작동 중입니다.`, "success");
        } else {
          showAlert(`❌ 연동 확인 필요: ${data.message}`, "error");
        }
      } catch (err) {
        showAlert("통신 오류: " + err.message, "error");
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = `<i class="fa-solid fa-vial-circle-check"></i> 연동 테스트`;
      }
    });
  }
}

// 유틸리티
function formatDateTime(isoString) {
  try {
    const d = new Date(isoString);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${h}:${min}`;
  } catch {
    return isoString;
  }
}


// ==========================================
// 6. nunu 홈 화면 광고 및 배너 관리 모듈
// ==========================================
let allAdminAds = [];
let isGlobalAdsEnabled = true;

async function loadAdminAds() {
  try {
    const res = await fetch(getApiUrl("/api/admin/ads");
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        allAdminAds = Array.isArray(data.ads) ? data.ads : [];
        isGlobalAdsEnabled = !!data.globalAdsEnabled;
        updateGlobalAdsSwitchUI();
        renderAdsTable();
        return;
      }
    }
  } catch (err) {
    console.error("광고 목록 로드 실패:", err);
  }
}

function updateGlobalAdsSwitchUI() {
  const toggle = document.getElementById("globalAdsToggle");
  const statusText = document.getElementById("globalAdsStatusText");
  if (toggle) toggle.checked = isGlobalAdsEnabled;
  if (statusText) {
    statusText.textContent = isGlobalAdsEnabled ? "ON" : "OFF";
    if (isGlobalAdsEnabled) {
      statusText.classList.remove("off");
    } else {
      statusText.classList.add("off");
    }
  }
}

function renderAdsTable() {
  const tbody = document.getElementById("adsTableBody");
  const emptyState = document.getElementById("adsEmptyState");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (allAdminAds.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  allAdminAds.forEach((ad) => {
    const tr = document.createElement("tr");

    // 미디어 미리보기 셀
    let mediaHtml = "";
    if (ad.mediaType === "image" && ad.mediaUrl) {
      mediaHtml = `
        <div>
          <span class="ad-type-tag image"><i class="fa-regular fa-image"></i> 이미지</span>
          <img src="${escapeHtml(ad.mediaUrl)}" alt="광고 이미지" class="ad-media-thumb" onerror="this.onerror=null;this.src='https://placehold.co/110x60?text=Image+Load+Fail';">
        </div>
      `;
    } else if (ad.mediaType === "video" && ad.mediaUrl) {
      mediaHtml = `
        <div>
          <span class="ad-type-tag video"><i class="fa-solid fa-film"></i> 동영상</span>
          <div class="ad-media-video-box">
            <video src="${escapeHtml(ad.mediaUrl)}" muted playsinline loop autoplay></video>
          </div>
        </div>
      `;
    } else {
      mediaHtml = `
        <div>
          <span class="ad-type-tag none"><i class="fa-solid fa-font"></i> 텍스트 배너</span>
          <div class="ad-media-placeholder"><i class="fa-solid fa-rectangle-ad"></i> 일반 배너</div>
        </div>
      `;
    }

    let linkHtml = `<span style="font-size: 12px; color: #94a3b8;">(링크 없음)</span>`;
    if (ad.linkUrl) {
      linkHtml = `
        <a href="${escapeHtml(ad.linkUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #4f46e5; text-decoration: underline; word-break: break-all; display: inline-flex; align-items: center; gap: 4px;">
          <span>${escapeHtml(ad.linkUrl.length > 35 ? ad.linkUrl.slice(0, 35) + '...' : ad.linkUrl)}</span>
          <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 10px;"></i>
        </a>
      `;
    }

    tr.innerHTML = `
      <td style="font-weight: 700; color: #64748b;">#${ad.id}</td>
      <td>${mediaHtml}</td>
      <td>
        <strong style="font-size: 14.5px; color: #0f172a; display: block; margin-bottom: 3px;">${escapeHtml(ad.title)}</strong>
        <span style="font-size: 12.5px; color: #64748b; display: block; line-height: 1.4;">${escapeHtml(ad.desc || "(설명 없음)")}</span>
      </td>
      <td>${linkHtml}</td>
      <td style="text-align: center;">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px;">
          <label class="toggle-switch" title="클릭하여 이 광고 켜기/끄기">
            <input type="checkbox" class="ad-item-toggle" data-id="${ad.id}" ${ad.isActive ? "checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
          <span class="ad-status-badge ${ad.isActive ? 'active' : 'inactive'}" style="font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 12px; background: ${ad.isActive ? '#dcfce7' : '#f1f5f9'}; color: ${ad.isActive ? '#15803d' : '#64748b'}; border: 1px solid ${ad.isActive ? '#86efac' : '#cbd5e1'};">
            ${ad.isActive ? '개별 ON' : '개별 OFF'}
          </span>
        </div>
      </td>
      <td style="font-size: 12px; color: #64748b;">${formatDateTime(ad.createdAt)}</td>
      <td style="text-align: center;">
        <button class="btn-delete-user btn-delete-ad" data-id="${ad.id}" title="광고 삭제">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // 개별 광고 토글 이벤트
  tbody.querySelectorAll(".ad-item-toggle").forEach((chk) => {
    chk.addEventListener("change", async (e) => {
      const adId = e.target.dataset.id;
      const willBeActive = e.target.checked;
      try {
        const res = await fetch(getApiUrl(`/api/admin/ads/${adId}/toggle`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: willBeActive })
        });
        const data = await res.json();
        if (data.success) {
          const item = allAdminAds.find(a => String(a.id) === String(adId));
          if (item) item.isActive = willBeActive;
          renderAdsTable();
        } else {
          alert(data.message || "상태 변경 실패");
          e.target.checked = !willBeActive;
        }
      } catch (err) {
        alert("네트워크 오류: " + err.message);
        e.target.checked = !willBeActive;
      }
    });
  });

  // 개별 광고 삭제 이벤트
  tbody.querySelectorAll(".btn-delete-ad").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const adId = btn.dataset.id;
      const target = allAdminAds.find(a => String(a.id) === String(adId));
      const title = target ? target.title : `ID #${adId}`;
      if (!confirm(`'${title}' 광고를 영구 삭제하시겠습니까?`)) {
        return;
      }

      try {
        const res = await fetch(getApiUrl(`/api/admin/ads/${adId}`, {
          method: "DELETE"
        });
        const data = await res.json();
        if (data.success) {
          allAdminAds = allAdminAds.filter(a => String(a.id) !== String(adId));
          renderAdsTable();
          alert("✅ 광고가 삭제되었습니다.");
        } else {
          alert(data.message || "삭제 실패");
        }
      } catch (err) {
        alert("네트워크 오류: " + err.message);
      }
    });
  });
}

function initAdsManager() {
  const globalToggle = document.getElementById("globalAdsToggle");
  const openModalBtn = document.getElementById("openAddAdModalBtn");
  const modal = document.getElementById("addAdModal");
  const closeBtn = document.getElementById("closeAddAdModalBtn");
  const cancelBtn = document.getElementById("cancelAddAdBtn");
  const saveBtn = document.getElementById("saveNewAdBtn");
  const mediaTypeSelect = document.getElementById("newAdMediaType");
  const mediaUrlGroup = document.getElementById("adMediaUrlGroup");
  const mediaUrlLabel = document.getElementById("adMediaUrlLabel");
  const mediaUrlInput = document.getElementById("newAdMediaUrl");

  // 전체 광고 ON/OFF 스위치 토글
  if (globalToggle) {
    globalToggle.addEventListener("change", async (e) => {
      const willBeActive = e.target.checked;
      try {
        const res = await fetch(getApiUrl("/api/admin/ads/toggle-global", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: willBeActive })
        });
        const data = await res.json();
        if (data.success) {
          isGlobalAdsEnabled = willBeActive;
          updateGlobalAdsSwitchUI();
        } else {
          alert(data.message || "전체 상태 변경 실패");
          e.target.checked = !willBeActive;
        }
      } catch (err) {
        alert("통신 오류: " + err.message);
        e.target.checked = !willBeActive;
      }
    });
  }

  const mediaFileGroup = document.getElementById("adMediaFileGroup");
  const mediaFileLabel = document.getElementById("adMediaFileLabel");
  const mediaFileInput = document.getElementById("newAdMediaFile");
  const fileUploadBox = document.querySelector(".file-upload-box");
  const fileUploadPrompt = document.getElementById("fileUploadPrompt");
  const filePreviewBox = document.getElementById("filePreviewBox");
  const filePreviewContent = document.getElementById("filePreviewContent");
  const selectedFileName = document.getElementById("selectedFileName");
  const btnRemoveSelectedFile = document.getElementById("btnRemoveSelectedFile");

  let uploadedFileBase64 = "";
  let uploadedFileName = "";

  const resetFileUploadUI = () => {
    uploadedFileBase64 = "";
    uploadedFileName = "";
    if (mediaFileInput) mediaFileInput.value = "";
    if (filePreviewBox) filePreviewBox.style.display = "none";
    if (filePreviewContent) filePreviewContent.innerHTML = "";
    if (fileUploadPrompt) fileUploadPrompt.style.display = "block";
    if (selectedFileName) selectedFileName.textContent = "";
  };

  // 파일 선택 영역 클릭 시 숨겨진 input[type=file] 트리거
  if (fileUploadBox && mediaFileInput) {
    fileUploadBox.addEventListener("click", (e) => {
      if (e.target.closest("#btnRemoveSelectedFile")) return;
      mediaFileInput.click();
    });
  }

  if (btnRemoveSelectedFile) {
    btnRemoveSelectedFile.addEventListener("click", (e) => {
      e.stopPropagation();
      resetFileUploadUI();
    });
  }

  // 파일 선택 시 Base64 읽기 및 실시간 미리보기
  if (mediaFileInput) {
    mediaFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const mediaType = mediaTypeSelect ? mediaTypeSelect.value : "image";
      uploadedFileName = file.name;
      if (selectedFileName) selectedFileName.textContent = file.name;

      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        uploadedFileBase64 = loadEvt.target.result;
        if (fileUploadPrompt) fileUploadPrompt.style.display = "none";
        if (filePreviewBox) filePreviewBox.style.display = "block";

        if (filePreviewContent) {
          if (file.type.startsWith("video/") || mediaType === "video") {
            filePreviewContent.innerHTML = `<video src="${uploadedFileBase64}" controls autoplay muted style="max-height: 160px; max-width: 100%; border-radius: 6px;"></video>`;
          } else {
            filePreviewContent.innerHTML = `<img src="${uploadedFileBase64}" alt="미리보기" style="max-height: 160px; max-width: 100%; border-radius: 6px; object-fit: contain;">`;
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // 미디어 첨부 종류 변경 감지
  if (mediaTypeSelect && mediaFileGroup) {
    mediaTypeSelect.addEventListener("change", () => {
      const val = mediaTypeSelect.value;
      resetFileUploadUI();
      if (val === "none") {
        mediaFileGroup.style.display = "none";
        if (mediaUrlInput) mediaUrlInput.value = "";
      } else if (val === "image") {
        mediaFileGroup.style.display = "block";
        if (mediaFileLabel) mediaFileLabel.textContent = "🖼️ 광고 이미지 파일 첨부 (JPG, PNG, GIF, WebP)";
        if (mediaFileInput) mediaFileInput.accept = "image/*";
        const promptText = document.getElementById("fileUploadPromptText");
        if (promptText) promptText.textContent = "내 컴퓨터에서 이미지 파일 선택";
      } else if (val === "video") {
        mediaFileGroup.style.display = "block";
        if (mediaFileLabel) mediaFileLabel.textContent = "🎬 광고 동영상 파일 첨부 (MP4, WebM)";
        if (mediaFileInput) mediaFileInput.accept = "video/mp4,video/webm,video/*";
        const promptText = document.getElementById("fileUploadPromptText");
        if (promptText) promptText.textContent = "내 컴퓨터에서 동영상 파일 선택";
      }
    });
  }

  // 모달 열기/닫기
  const openModal = () => {
    if (modal) {
      document.getElementById("addAdForm").reset();
      resetFileUploadUI();
      if (mediaFileGroup) mediaFileGroup.style.display = "none";
      modal.style.display = "flex";
      document.getElementById("newAdTitle").focus();
    }
  };

  const closeModal = () => {
    if (modal) modal.style.display = "none";
  };

  if (openModalBtn) openModalBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  window.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // 신규 광고 등록 저장
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const title = document.getElementById("newAdTitle").value.trim();
      const desc = document.getElementById("newAdDesc").value.trim();
      const linkUrl = document.getElementById("newAdLinkUrl").value.trim();
      const mediaType = mediaTypeSelect ? mediaTypeSelect.value : "none";
      let finalMediaUrl = mediaUrlInput ? mediaUrlInput.value.trim() : "";

      if (!title) {
        alert("광고 제목을 입력해주세요.");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 등록 중...`;

      try {
        // 로컬 파일이 선택된 경우 먼저 서버로 업로드하여 영구 URL 획득
        if (uploadedFileBase64 && mediaType !== "none") {
          saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 파일 업로드 중...`;
          const uploadRes = await fetch(getApiUrl("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: uploadedFileName || "media",
              dataUrl: uploadedFileBase64
            })
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success && uploadData.url) {
            finalMediaUrl = uploadData.url;
          } else {
            throw new Error(uploadData.message || "파일 업로드에 실패했습니다.");
          }
        }

        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 광고 저장 중...`;
        const res = await fetch(getApiUrl("/api/admin/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            desc,
            linkUrl,
            mediaType,
            mediaUrl: finalMediaUrl
          })
        });
        const data = await res.json();
        if (data.success) {
          closeModal();
          await loadAdminAds();
          alert("🎉 새로운 광고(미디어 파일 포함)가 성공적으로 등록되었습니다!");
        } else {
          alert(data.message || "광고 등록 실패");
        }
      } catch (err) {
        alert("등록 중 오류가 발생했습니다: " + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-check"></i> 광고 등록 완료`;
      }
    });
  }
}

// ==========================================
// 6. 탈로스(Talos) 공식 시험지 및 정답 관리 로직
// ==========================================
let allTalosTests = [];

async function loadTalosTests() {
  const tableBody = document.getElementById("talosTestsTableBody");
  const emptyState = document.getElementById("talosEmptyState");
  if (!tableBody) return;

  try {
    const res = await fetch(getApiUrl("/api/admin/talos-tests");
    if (!res.ok) throw new Error("시험지 목록 조회 실패");
    const data = await res.json();
    if (data.success && Array.isArray(data.tests)) {
      allTalosTests = data.tests;
      renderTalosTestsTable(allTalosTests);
    }
  } catch (err) {
    console.error("Talos tests load error:", err);
  }
}

function renderTalosTestsTable(tests) {
  const tableBody = document.getElementById("talosTestsTableBody");
  const emptyState = document.getElementById("talosEmptyState");
  if (!tableBody) return;

  if (!tests || tests.length === 0) {
    tableBody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  tests.forEach((t) => {
    const isActive = t.isActive === 1 || t.isActive === true;
    const dateFormatted = t.createdAt ? t.createdAt.substring(0, 16).replace("T", " ") : "-";
    
    html += `
      <tr>
        <td>
          <span class="talos-code-badge"><i class="fa-solid fa-barcode"></i> ${escapeHtml(t.testCode)}</span>
        </td>
        <td>
          <strong>${escapeHtml(t.title)}</strong>
        </td>
        <td style="text-align: center;">
          <span style="display: inline-block; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-family: monospace; font-size: 12px;">
            <i class="fa-solid fa-key" style="font-size: 10px;"></i> ${escapeHtml(t.authCode || '-')}
          </span>
        </td>
        <td>
          <span class="talos-subject-pill">${escapeHtml(t.subject || '공통')}</span>
        </td>
        <td>
          <span style="font-size: 12.5px; color: #475569;">${escapeHtml(t.grade || '전체')}</span>
        </td>
        <td style="text-align: center; font-weight: 700; color: #6366f1;">
          ${t.questionCount || 0}문항
        </td>
        <td style="text-align: center; font-weight: 700; color: #059669;">
          ${t.totalPoints || 100}점
        </td>
        <td style="text-align: center;">
          <label class="toggle-switch">
            <input type="checkbox" ${isActive ? "checked" : ""} onchange="toggleTalosTestActive(${t.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td style="font-size: 12px; color: #64748b;">
          ${dateFormatted}
        </td>
        <td style="text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
            <button type="button" class="btn-subtle-action" onclick="openEditTalosModal(${t.id})" title="시험지 및 정답 수정" style="color: #6366f1; padding: 4px 8px; border-radius: 4px; border: 1px solid #e0e7ff; background: #eef2ff;">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn-subtle-action" onclick="deleteTalosTest(${t.id}, '${escapeHtml(t.testCode)}')" title="삭제" style="color: #ef4444; padding: 4px 8px; border-radius: 4px; border: 1px solid #fee2e2; background: #fff1f2;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

window.toggleTalosTestActive = async function(id, isActive) {
  try {
    const res = await fetch(getApiUrl("/api/admin/talos-tests/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive })
    });
    const data = await res.json();
    if (data.success) {
      await loadTalosTests();
    } else {
      alert(data.message || "상태 변경 실패");
      await loadTalosTests();
    }
  } catch (err) {
    alert("오류가 발생했습니다: " + err.message);
    await loadTalosTests();
  }
};

window.deleteTalosTest = async function(id, testCode) {
  if (!confirm(`[탈로스 공식 시험지 삭제]\n시험 코드: ${testCode}\n\n정말 삭제하시겠습니까? 삭제 후에는 AI 스캐너에서 해당 시험지 채점이 불가능합니다.`)) {
    return;
  }
  try {
    const res = await fetch(getApiUrl("/api/admin/talos-tests/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      alert("시험지가 삭제되었습니다.");
      await loadTalosTests();
    } else {
      alert(data.message || "삭제 실패");
    }
  } catch (err) {
    alert("삭제 중 오류가 발생했습니다: " + err.message);
  }
};

// 모달 및 문항 편집기
function initTalosManager() {
  const modal = document.getElementById("talosTestModal");
  const openBtn = document.getElementById("openAddTalosTestModalBtn");
  const closeBtn = document.getElementById("closeTalosModalBtn");
  const cancelBtn = document.getElementById("cancelTalosModalBtn");
  const addQBtn = document.getElementById("btnAddTalosQuestionBtn");
  const saveBtn = document.getElementById("saveTalosTestBtn");

  const closeModal = () => {
    if (modal) modal.style.display = "none";
  };

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      openCreateTalosModal();
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  window.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  if (addQBtn) {
    addQBtn.addEventListener("click", () => {
      appendTalosQuestionRow();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", saveTalosTest);
  }
}

function openCreateTalosModal() {
  const modal = document.getElementById("talosTestModal");
  const titleEl = document.getElementById("talosModalTitle");
  const editIdInput = document.getElementById("talosEditTestId");
  const codeInput = document.getElementById("talosTestCodeInput");
  const titleInput = document.getElementById("talosTestTitleInput");
  const subjectInput = document.getElementById("talosTestSubjectInput");
  const gradeInput = document.getElementById("talosTestGradeInput");
  const pointsInput = document.getElementById("talosTestPointsInput");
  const authCodeInput = document.getElementById("talosTestAuthCodeInput");
  const qContainer = document.getElementById("talosQuestionsContainer");

  if (titleEl) titleEl.textContent = "탈로스(Talos) 공식 시험지 및 정답 등록";
  if (editIdInput) editIdInput.value = "";
  if (codeInput) { codeInput.value = "TALOS-"; codeInput.disabled = false; }
  if (titleInput) titleInput.value = "";
  if (subjectInput) subjectInput.value = "국어";
  if (gradeInput) gradeInput.value = "초등 3~4학년";
  if (pointsInput) pointsInput.value = "100";
  if (authCodeInput) authCodeInput.value = "";
  if (qContainer) qContainer.innerHTML = "";

  // 기본 3개 문항 추가
  appendTalosQuestionRow(1, "", "", 20, "");
  appendTalosQuestionRow(2, "", "", 20, "");
  appendTalosQuestionRow(3, "", "", 20, "");

  if (modal) modal.style.display = "flex";
}

window.openEditTalosModal = function(id) {
  const test = allTalosTests.find(t => t.id === id);
  if (!test) return;

  const modal = document.getElementById("talosTestModal");
  const titleEl = document.getElementById("talosModalTitle");
  const editIdInput = document.getElementById("talosEditTestId");
  const codeInput = document.getElementById("talosTestCodeInput");
  const titleInput = document.getElementById("talosTestTitleInput");
  const subjectInput = document.getElementById("talosTestSubjectInput");
  const gradeInput = document.getElementById("talosTestGradeInput");
  const pointsInput = document.getElementById("talosTestPointsInput");
  const authCodeInput = document.getElementById("talosTestAuthCodeInput");
  const qContainer = document.getElementById("talosQuestionsContainer");

  if (titleEl) titleEl.textContent = `탈로스 시험지 수정: ${test.testCode}`;
  if (editIdInput) editIdInput.value = test.id;
  if (codeInput) { codeInput.value = test.testCode; codeInput.disabled = false; }
  if (titleInput) titleInput.value = test.title || "";
  if (subjectInput) subjectInput.value = test.subject || "";
  if (gradeInput) gradeInput.value = test.grade || "";
  if (pointsInput) pointsInput.value = test.totalPoints || 100;
  if (authCodeInput) authCodeInput.value = test.authCode || "";
  if (qContainer) qContainer.innerHTML = "";

  const questions = test.questions || [];
  if (questions.length === 0) {
    appendTalosQuestionRow(1, "", "", 20, "");
  } else {
    questions.forEach((q, idx) => {
      appendTalosQuestionRow(q.number || (idx + 1), q.question || "", q.answer || "", q.points || 20, q.explanation || "");
    });
  }

  if (modal) modal.style.display = "flex";
};

function appendTalosQuestionRow(number, questionText, answerText, points, explanationText) {
  const qContainer = document.getElementById("talosQuestionsContainer");
  if (!qContainer) return;

  const currentCount = qContainer.querySelectorAll(".talos-q-item").length;
  const num = number || (currentCount + 1);

  const qCard = document.createElement("div");
  qCard.className = "talos-q-item";
  qCard.innerHTML = `
    <div class="talos-q-header">
      <span class="talos-q-num"><i class="fa-solid fa-circle-question"></i> 문항 <span class="q-num-text">${num}</span></span>
      <button type="button" class="btn-remove-q" title="문항 삭제" onclick="this.closest('.talos-q-item').remove(); renumberTalosQuestions();">
        <i class="fa-solid fa-trash-can"></i> 삭제
      </button>
    </div>
    <div class="talos-q-grid">
      <div>
        <input type="text" class="q-question-input" placeholder="문제 내용 (예: '나무'의 반대말은?)" value="${escapeHtml(questionText || '')}" required>
      </div>
      <div>
        <input type="text" class="q-answer-input" placeholder="공식 정답 (예: 숲 / 3번)" value="${escapeHtml(answerText || '')}" required style="font-weight: 700; color: #1e293b;">
      </div>
      <div>
        <input type="number" class="q-points-input" placeholder="배점" value="${points || 20}" min="1" max="100">
      </div>
    </div>
    <div class="talos-q-explanation">
      <input type="text" class="q-exp-input" placeholder="정답 해설 및 채점 기준 (예: '나무'의 맞춤법 또는 의미 관계 해설)" value="${escapeHtml(explanationText || '')}">
    </div>
  `;
  qContainer.appendChild(qCard);
}

function renumberTalosQuestions() {
  const items = document.querySelectorAll("#talosQuestionsContainer .talos-q-item");
  items.forEach((item, idx) => {
    const numEl = item.querySelector(".q-num-text");
    if (numEl) numEl.textContent = idx + 1;
  });
}

async function saveTalosTest() {
  const editId = document.getElementById("talosEditTestId").value;
  const testCode = document.getElementById("talosTestCodeInput").value.trim().toUpperCase();
  const title = document.getElementById("talosTestTitleInput").value.trim();
  const subject = document.getElementById("talosTestSubjectInput").value.trim();
  const grade = document.getElementById("talosTestGradeInput").value.trim();
  const pointsInput = document.getElementById("talosTestPointsInput");
  const totalPoints = parseInt(pointsInput ? pointsInput.value : 100, 10) || 100;
  const authCode = document.getElementById("talosTestAuthCodeInput") ? document.getElementById("talosTestAuthCodeInput").value.trim() : "";

  if (!testCode) {
    alert("시험 고유 코드를 입력해주세요. (예: TALOS-KOR-01)");
    return;
  }
  if (!testCode.startsWith("TALOS")) {
    alert("탈로스 공식 시험 코드는 반드시 'TALOS'로 시작해야 합니다. (예: TALOS-KOR-02)");
    return;
  }
  if (!title) {
    alert("시험지 명칭을 입력해주세요.");
    return;
  }
  if (!authCode) {
    alert("시험지 인증코드를 입력해주세요. (학생이 시험 모드 스캔 시 입력해야 하는 비밀번호입니다)");
    return;
  }

  // 문항 수집
  const qItems = document.querySelectorAll("#talosQuestionsContainer .talos-q-item");
  if (qItems.length === 0) {
    alert("최소 1개 이상의 문항을 등록해야 합니다.");
    return;
  }

  const questions = [];
  let calculatedPoints = 0;
  for (let i = 0; i < qItems.length; i++) {
    const item = qItems[i];
    const qText = item.querySelector(".q-question-input").value.trim();
    const ansText = item.querySelector(".q-answer-input").value.trim();
    const pts = parseInt(item.querySelector(".q-points-input").value, 10) || 10;
    const expText = item.querySelector(".q-exp-input").value.trim();

    if (!qText || !ansText) {
      alert(`${i + 1}번 문항의 문제 내용과 정답을 모두 입력해주세요.`);
      return;
    }

    questions.push({
      number: i + 1,
      question: qText,
      answer: ansText,
      points: pts,
      explanation: expText
    });
    calculatedPoints += pts;
  }

  const saveBtn = document.getElementById("saveTalosTestBtn");
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...`;

  try {
    const isEdit = !!editId;
    const url = isEdit ? "/api/admin/talos-tests/update" : "/api/admin/talos-tests";
    const payload = {
      testCode,
      title,
      subject,
      grade,
      totalPoints: calculatedPoints || totalPoints,
      authCode,
      questions
    };
    if (isEdit) payload.id = parseInt(editId, 10);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("talosTestModal").style.display = "none";
      await loadTalosTests();
      alert(`🎉 탈로스 공식 시험지 [${testCode}]가 성공적으로 등록/수정되었습니다!`);
    } else {
      alert(data.message || "저장에 실패했습니다.");
    }
  } catch (err) {
    alert("저장 중 오류 발생: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> 탈로스 시험지 저장`;
  }
}

// ==========================================
// 시스템 긴급 비상정지 제어 로직
// ==========================================
function initEmergencyControl() {
  const triggerBtn = document.getElementById("btnTriggerEmergencyStop");
  const resetBtn = document.getElementById("btnResetEmergencyStop");
  const headerBtn = document.getElementById("btnEmergencyStop");
  const badge = document.getElementById("emergencyStatusBadge");
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nunu_emergency_channel") : null;

  async function checkStatus() {
    try {
      const res = await fetch(getApiUrl("/api/emergency-status?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        updateUI(Boolean(data.emergencyStopped));
        return;
      }
    } catch (e) {}
    // Fallback to localStorage
    const stopped = localStorage.getItem("nunu_emergency_stop") === "true";
    updateUI(stopped);
  }

  function updateUI(stopped) {
    if (stopped) {
      if (badge) {
        badge.className = "emergency-badge active";
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 비상정지 발동 중';
      }
      if (triggerBtn) triggerBtn.style.display = "none";
      if (resetBtn) resetBtn.style.display = "inline-flex";
      if (headerBtn) {
        headerBtn.className = "btn-emergency-stop active";
        headerBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>비상정지 해제</span>';
      }
    } else {
      if (badge) {
        badge.className = "emergency-badge normal";
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> 정상 운영 중';
      }
      if (triggerBtn) triggerBtn.style.display = "inline-flex";
      if (resetBtn) resetBtn.style.display = "none";
      if (headerBtn) {
        headerBtn.className = "btn-emergency-stop";
        headerBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>비상정지</span>';
      }
    }
  }

  async function setEmergency(active) {
    if (active) {
      const confirmed = confirm("🚨 [경고] 전체 시스템 비상정지를 발동하시겠습니까?\n\n- 누누포털 웹과 누누스카이 앱 화면 전체에 사이렌 경광등이 회전합니다.\n- '관리자로 인해 종료되었습니다.' 화면이 뜨며 모든 기능이 즉시 차단됩니다.");
      if (!confirmed) return;
    } else {
      const confirmed = confirm("✅ 비상정지를 해제하고 정상 서비스로 즉시 복구하시겠습니까?");
      if (!confirmed) return;
    }

    localStorage.setItem("nunu_emergency_stop", active ? "true" : "false");
    if (channel) {
      channel.postMessage({ type: "EMERGENCY_STOP", active: active });
    }

    try {
      await fetch(getApiUrl("/api/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: active, message: "관리자로 인해 종료되었습니다." })
      });
    } catch (e) {}

    updateUI(active);
    alert(active ? "🚨 전체 시스템 비상정지가 발동되었습니다!\n누누포털 웹과 누누스카이 앱에 사이렌과 종료 화면이 표출됩니다." : "✅ 비상정지가 해제되었습니다. 정상 서비스로 복구되었습니다.");
  }

  window.triggerEmergencyStopAdmin = setEmergency;
  window.toggleEmergencyStopAdmin = () => {
    const isStopped = (badge && badge.classList.contains("active")) || localStorage.getItem("nunu_emergency_stop") === "true";
    setEmergency(!isStopped);
  };

  if (triggerBtn) triggerBtn.addEventListener("click", () => setEmergency(true));
  if (resetBtn) resetBtn.addEventListener("click", () => setEmergency(false));
  if (headerBtn) {
    headerBtn.addEventListener("click", () => {
      const isStopped = (badge && badge.classList.contains("active")) || localStorage.getItem("nunu_emergency_stop") === "true";
      setEmergency(!isStopped);
    });
  }

  checkStatus();
  setInterval(checkStatus, 3000);
}


