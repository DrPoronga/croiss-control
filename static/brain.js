let pipelineData = {};
let teamScores = {};
let airlinesData = {};
let currentTeam = "";
let closureChartInstance = null;
let auditContext = "analyst"; 
let activeTargetName = "";    
let currentDisplayedCases = [];
let currentMenuContext = "products"; 
let customersContainer = null;
let currentTeamChartMode = "bar"; 
let currentCompareLevel = 1;
let compareContext = ""; 
let selectedContenders = [];
let compareChartInstance = null;
let compareContextLevel = 2; 
let currentCompareTab = "active_backlog"; 
let currentProductLevel = 1;
let currentProductCategory = "";
let activeFilters = { account: "ALL", status: "ALL", sub_status: "ALL", alert: "ALL" };
let globalJiraRecords = [];
let jiraProdChartInstance = null;
let jiraAnalystChartInstance = null;
let currentJiraFilterMode = "ALL";
let currentGlobalTimeframe = "12";
let currentAnalystCasesMode = "active";
let currentAnalystClosedTimeframe = "12";
let qcChartInstance = null;
let currentQcTargetCase = "";
let currentQcClosedMonth = "";
let selectedCopyColors = [];
let currentSortColumn = null;
let currentSortDirection = 'asc';
let currentEfficiencyTimeframe = "12";
let currentCompareTimeframe = "YTD";
let jiraHealthSubTab = "table"; 
let currentJiraTargetRecords = [];
let jiraActiveFilters = { project: "ALL", general_status: "ALL", reason: "ALL", owner: "ALL" };
let jiraDevChartInstance = null;
let jiraExpandedChartInstance = null;
let jiraAnalystsVolumeChartInstance = null;
let jiraAnalystsFilterMode = "ALL";


window.handleHeaderSort = function(key) {
    if (currentSortColumn === key) {
        // Determinamos cuál fue la dirección inicial según el tipo de dato
        const initialDir = (key === 'days' || key === 'score' || key === 'closed_date') ? 'desc' : 'asc';
        
        if (currentSortDirection === initialDir) {
            // 2do Clic: Invierte el sentido del ordenamiento
            currentSortDirection = (initialDir === 'desc') ? 'asc' : 'desc';
        } else {
            // 3er Clic: QUITA el ordenamiento y vuelve a la lista original predeterminada
            currentSortColumn = null;
            currentSortDirection = 'asc';
        }
    } else {
        // 1er Clic: Activa el ordenamiento en la columna seleccionada
        currentSortColumn = key;
        currentSortDirection = (key === 'days' || key === 'score' || key === 'closed_date') ? 'desc' : 'asc';
    }
    
    applyFiltersAndRender();
    buildHeaderFilters();
};

window.resetAllTableFilters = function() {
    selectedCopyColors = [];
    activeFilters = { account: "ALL", status: "ALL", sub_status: "ALL", alert: "ALL" };
    currentSortColumn = null;
    currentSortDirection = 'asc';
    
    document.querySelectorAll("#copy-filter-toolbar .qa-btn").forEach(btn => {
        btn.style.outline = "";
        btn.style.outlineOffset = "";
        btn.style.transform = "";
        btn.style.boxShadow = "";
    });
    
    const copyBtn = document.getElementById("btn-execute-multi-copy");
    if (copyBtn) copyBtn.style.display = "none";

    buildHeaderFilters();
    applyFiltersAndRender();
    showToast("All filters cleared. Showing complete backlog.", "success");
};
window.changeCompareTimeframe = function(timeframe) {
    currentCompareTimeframe = timeframe;
    
    // 1. Limpiar los estilos activos de todos los botones de la barra "Compare"
    document.querySelectorAll(".segmented-item-comp").forEach(btn => {
        btn.classList.remove("active");
        btn.style.background = "transparent";
        btn.style.color = "#64748B";
        btn.style.fontWeight = "600";
    });
    
    // 2. Aplicar estilos destacados al botón seleccionado
    const activeBtn = document.querySelector(`.btn-comp-${timeframe}`);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.style.background = "#FFFFFF";
        activeBtn.style.color = "#1E293B";
        activeBtn.style.fontWeight = "700";
    }
    
    // 3. Re-renderizar la matriz de KPIs y el gráfico con la nueva temporalidad elegida
    renderCompareKPIMatrix();
    renderCompareTrendChart();
};

window.changeEfficiencyTimeframe = function(timeframe) {
    currentEfficiencyTimeframe = timeframe;
    
    // 1. Limpiar los estilos activos de todos los botones de la barra "Efficiency"
    document.querySelectorAll(".segmented-item-eff").forEach(btn => {
        btn.classList.remove("active");
        btn.style.background = "transparent";
        btn.style.color = "#64748B";
        btn.style.fontWeight = "600";
    });
    
    // 2. Aplicar estilos destacados al botón seleccionado
    const activeBtn = document.querySelector(`.btn-eff-${timeframe}`);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.style.background = "#FFFFFF";
        activeBtn.style.color = "#1E293B";
        activeBtn.style.fontWeight = "700";
    }
    
    // 3. Disparar el re-renderizado
    if (auditContext === "analyst") {
        loadEfficiencyStats(activeTargetName, currentEfficiencyTimeframe);
    } else {
        loadTeamEfficiencyStats(activeTargetName, currentEfficiencyTimeframe);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    injectCustomStyles(); 
    fetchDataFromBackend();
    setupGlobalActions();
    setupInternalSidebarNavigation();
    injectGlobalTimeframeSelector();

    // Listener de las evaluaciones integrado aquí
    const btnEvaluations = document.getElementById("audit-tab-evaluations");
    const viewEvaluations = document.getElementById("audit-view-evaluations");
    
    if (btnEvaluations) {
        btnEvaluations.onclick = () => {
            document.querySelectorAll(".audit-sidebar-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".audit-tab-content").forEach(v => v.style.setProperty('display', 'none', 'important'));
            
            btnEvaluations.classList.add("active");
            viewEvaluations.style.setProperty('display', 'flex', 'important');
            
            loadEvaluationsTab(activeTargetName);
        };
    }
});

window.toggleCopyColor = function(btn) {
    const colorCode = btn.getAttribute("data-color");
    const index = selectedCopyColors.indexOf(colorCode);
    
    if (index > -1) {
        selectedCopyColors.splice(index, 1);
        btn.style.outline = "";
        btn.style.outlineOffset = "";
        btn.style.transform = "";
        btn.style.boxShadow = "";
    } else {
        selectedCopyColors.push(colorCode);
        btn.style.outline = "2px solid #111111";
        btn.style.outlineOffset = "-2px"; 
        btn.style.transform = "translateY(-2px)";
        btn.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.12)";
    }
    
    const copyBtn = document.getElementById("btn-execute-multi-copy");
    if (copyBtn) {
        if (selectedCopyColors.length > 0) {
            copyBtn.style.display = "inline-flex";
            copyBtn.onclick = executeMultiCopy;
        } else {
            copyBtn.style.display = "none";
        }
    }

    // 🟢 Aplica el filtro visual en la tabla inmediatamente al presionar un botón de color
    applyFiltersAndRender();
};

window.executeMultiCopy = function() {
    if (!currentDisplayedCases || currentDisplayedCases.length === 0) {
        showToast("No active cases available to copy.", "error");
        return;
    }

    // 1. Empezamos con la lista completa original del analista o equipo
    let targetCases = currentDisplayedCases;

    // 2. Aplicamos la misma lógica de los filtros desplegables (Account, Status, Sub-status, Alerts)
    if (activeFilters.account !== "ALL") {
        targetCases = targetCases.filter(c => {
            let val = (c.account || "").toString().trim();
            if (val === "") val = "(Empty)";
            return val === activeFilters.account;
        });
    }
    if (activeFilters.status !== "ALL") {
        targetCases = targetCases.filter(c => {
            let val = (c.status || "").toString().trim();
            if (val === "") val = "(Empty)";
            return val === activeFilters.status;
        });
    }
    if (activeFilters.sub_status !== "ALL") {
        targetCases = targetCases.filter(c => {
            let val = (c.sub_status || "").toString().trim();
            if (val === "") val = "(Empty)";
            return val === activeFilters.sub_status;
        });
    }
    if (activeFilters.alert !== "ALL") {
        targetCases = targetCases.filter(c => {
            let val = (c.alert || "").toString().trim();
            if (val === "") val = "(No Alert)";
            return val === activeFilters.alert;
        });
    }

    // 3. Aplicamos el filtro de botones de colores si hay alguno seleccionado
    if (selectedCopyColors && selectedCopyColors.length > 0) {
        targetCases = targetCases.filter(c => selectedCopyColors.includes(c.color));
    }

    // Validamos si después de todos los filtros queda algún caso
    if (targetCases.length === 0) {
        showToast("No active cases found matching your active filters.", "error");
        return;
    }

    // Generamos el texto final a copiar
    let mailText = `COMBINED CASE REPORT\n`;
    if (currentTeam !== "") {
        mailText += `Product: ${currentTeam}\n`;
    }
    mailText += `Analyst/Team: ${activeTargetName}\n`;
    if (selectedCopyColors.length > 0) {
        mailText += `Included Categories: ${selectedCopyColors.join(", ")}\n`;
    }
    mailText += `Total cases: ${targetCases.length}\n`; 
    mailText += `-----------------------------------------------------------\n\n`;

    targetCases.forEach(c => {
        mailText += `Case: ${c.number} | Account: ${c.account || 'N/A'} | Days untouched: ${c.days} | Status: ${c.status} | Substatus: ${c.sub_status} | [${c.color}]\n`;
    });

    navigator.clipboard.writeText(mailText).then(() => {
        showToast(`Successfully copied ${targetCases.length} cases to your clipboard!`, "success");
        clearCopySelections(); 
    }).catch(err => {
        showToast("Error copying to clipboard. Check browser permissions.", "error");
    });
};

window.clearCopySelections = function() {
    selectedCopyColors = [];
    document.querySelectorAll("#copy-filter-toolbar .qa-btn").forEach(btn => {
        btn.style.outline = "";
        btn.style.outlineOffset = "";
        btn.style.transform = "";
        btn.style.boxShadow = "";
    });
    const copyBtn = document.getElementById("btn-execute-multi-copy");
    if (copyBtn) copyBtn.style.display = "none";

    applyFiltersAndRender();
};

window.setQcStatus = function(itemId, status, event) {
    if (event) event.stopPropagation(); 
    
    const group = document.getElementById(`qc_group_${itemId}`);
    if (!group) return;
    
    group.setAttribute("data-value", status);
    
    const buttons = group.querySelectorAll("button");
    buttons.forEach(btn => {
        btn.style.background = "transparent";
        btn.style.color = "#475569";
        btn.style.borderColor = "transparent";
        btn.style.boxShadow = "none";
    });
    
    const targetBtn = event.currentTarget || event.target;
    if (status === 'yes') {
        targetBtn.style.background = "#DCFCE7";
        targetBtn.style.color = "#15803D";
        targetBtn.style.borderColor = "#22C55E";
        targetBtn.style.boxShadow = "inset 0 2px 4px rgba(0,0,0,0.08)";
    } else if (status === 'no') {
        targetBtn.style.background = "#FEE2E2";
        targetBtn.style.color = "#B91C1C";
        targetBtn.style.borderColor = "#EF4444";
        targetBtn.style.boxShadow = "inset 0 2px 4px rgba(0,0,0,0.08)";
    } else if (status === 'na') {
        targetBtn.style.background = "#E2E8F0";
        targetBtn.style.color = "#334155";
        targetBtn.style.borderColor = "#94A3B8";
        targetBtn.style.boxShadow = "inset 0 2px 4px rgba(0,0,0,0.08)";
    }
    
    calculateQcLiveScore();
};

window.toggleQcDescription = function(id) {
    const el = document.getElementById(`desc-${id}`);
    if (el) {
        const isHidden = el.style.display === "none";
        el.style.display = isHidden ? "block" : "none";
        
        // Efecto visual sutil en el contenedor padre
        const parentRow = el.closest('.qc-field-row');
        if (parentRow) {
            parentRow.style.borderColor = isHidden ? "#F59E0B" : "#E2E8F0";
            parentRow.style.background = isHidden ? "#FFFDF5" : "#FFFFFF";
        }
    }
};

window.showQcPopover = function(id, event) {
    const popover = document.getElementById("qc-info-popover");
    if (!popover) return;

    // Detenemos la propagación del clic original para evitar cierres falsos
    if (event) event.stopPropagation();

    // Si ya está abierto en este mismo item, lo cerramos
    if (popover.getAttribute("data-active-id") === id && popover.style.display === "flex") {
        window.closeQcPopover();
        return;
    }

    let foundItem = qcSchema.integrity.find(i => i.id === id) || qcSchema.communication.find(i => i.id === id);
    if (!foundItem) return;

    document.querySelectorAll('.qc-field-row').forEach(row => {
        row.style.borderColor = "#E2E8F0";
        row.style.background = "#FFFFFF";
    });

    const currentRow = event.currentTarget.closest('.qc-field-row');
    if (currentRow) {
        currentRow.style.borderColor = "#38BDF8";
        currentRow.style.background = "#F0F9FF";
    }

    // DISEÑO INTERIOR ULTRA LIMPIO (SIN BOTÓN "X")
    popover.innerHTML = `
        <div style="margin-bottom: 8px;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: #0F172A;">${foundItem.label}</h3>
        </div>
        <div style="font-size: 0.84rem; color: #334155; line-height: 1.5; margin-bottom: 12px;">
            ${foundItem.desc}
        </div>
        <div style="font-size: 0.72rem; color: #38BDF8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid #E2E8F0; padding-top: 8px;">
            Maximum Value: ${foundItem.weight} points
        </div>
    `;

    popover.setAttribute("data-active-id", id);
    popover.style.display = "flex";

    const rect = currentRow.getBoundingClientRect();
    let topPos = rect.bottom + 8;
    let leftPos = rect.left; 

    if (topPos + 180 > window.innerHeight) {
        topPos = rect.top - 160; 
    }

    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;

    setTimeout(() => {
        popover.style.opacity = "1";
        popover.style.transform = "scale(1)";
    }, 10);

    // Escuchador dinámico para cerrar al cliquear afuera
    document.removeEventListener("click", window.handleQcOutsideClick);
    
    window.handleQcOutsideClick = function(e) {
        if (popover && !popover.contains(e.target)) {
            window.closeQcPopover();
        }
    };

    setTimeout(() => {
        document.addEventListener("click", window.handleQcOutsideClick);
    }, 20);
};

window.closeQcPopover = function() {
    const popover = document.getElementById("qc-info-popover");
    if (popover && popover.style.display === "flex") {
        popover.style.opacity = "0";
        popover.style.transform = "scale(0.95)";
        
        setTimeout(() => {
            popover.style.display = "none";
            popover.setAttribute("data-active-id", "");
        }, 150);
    }

    // 🧹 LIMPIEZA DE MEMORIA: Desactivamos el escuchador global ya que la ventana se cerró
    document.removeEventListener("click", window.handleQcOutsideClick);

    document.querySelectorAll('.qc-field-row').forEach(row => {
        row.style.borderColor = "#E2E8F0";
        row.style.background = "#FFFFFF";
    });
};

window.currentJiraTimeframe = "12";

function getCleanProductName(team) {
    const rawName = team.includes(" - ") ? team.split(" - ")[1] : team;
    const upper = rawName.toUpperCase().trim();
    if (upper === "PRICING & REVENUE MANAGEMENT") return "PRM";
    if (upper === "DATA & ANALYTICS") return "D&A";
    if (upper === "NETWORK PLANNING AND OPTIMIZATION") return "NPO";
    if (upper === "CHECK-IN") return "CHECKIN";
    return rawName;
}

function injectGlobalTimeframeSelector() {
    const refreshBtn = document.getElementById("btn-refresh-data");
    if (!refreshBtn || document.getElementById("global-timeframe-container")) return;

    const selectorContainer = document.createElement("div");
    selectorContainer.id = "global-timeframe-container";
    selectorContainer.style.cssText = "display: none; align-items: center; gap: 10px; background: #EBE5D8; border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 10px; margin-right: 12px; vertical-align: middle;";

    selectorContainer.innerHTML = `
        <span style="color: #475569; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; user-select: none;">Period:</span>
        <div id="global-timeframe-buttons" style="display: inline-flex; background: #E2E8F0; padding: 3px; border-radius: 8px; border: 1px solid #CBD5E1; gap: 4px;"></div>
    `;

    const refreshWrapper = refreshBtn.parentNode;
    refreshWrapper.parentNode.insertBefore(selectorContainer, refreshWrapper);

    const btnGroup = document.getElementById("global-timeframe-buttons");
    const options = [
        { value: "YTD", label: "YTD" },
        { value: "3", label: "3M" },
        { value: "6", label: "6M" },
        { value: "12", label: "12M" },
        { value: "24", label: "24M" }
    ];

    function updateActiveButtons() {
        btnGroup.innerHTML = "";
        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.innerText = opt.label;
            btn.type = "button";
            
            const isActive = currentGlobalTimeframe === opt.value;
            if (isActive) {
                btn.style.cssText = "background: #FFFFFF; color: #1E293B; border: 1px solid #CBD5E1; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 4px 12px; font-size: 0.78rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";
            } else {
                btn.style.cssText = "background: transparent; color: #64748B; border: 1px solid transparent; padding: 4px 12px; font-size: 0.78rem; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";
            }

            btn.onclick = async () => {
                currentGlobalTimeframe = opt.value;
                updateActiveButtons();
                showToast(`Recalculating closures under Period: ${opt.label}...`, "success");
                await fetchDataFromBackend();
                
                if (currentTeam) {
                    selectProductTeam(currentTeam);
                } else if (currentMenuContext === "products") {
                    loadProductsOverview();
                }
            };
            btnGroup.appendChild(btn);
        });
    }

    updateActiveButtons();
}

const airlineList = [
    { name: "American Airlines", code: "AA" },
    { name: "Aer Lingus", code: "EI" },
    { name: "Aeromexico", code: "AM" },
    { name: "Aerolineas Argentinas", code: "AR" },
    { name: "Afriqiyah Airways", code: "8U" },
    { name: "Air Cambodia", code: "K6" },
    { name: "Air Niugini", code: "PX" },
    { name: "Air Serbia", code: "JU" },
    { name: "Alaska Airlines", code: "AS" },
    { name: "ASKY Airlines", code: "KP" },
    { name: "Batik Air", code: "ID" },
    { name: "Biman Bangladesh", code: "BG" },
    { name: "Canadian North", code: "5T" },
    { name: "Cayman Airways", code: "KX" },
    { name: "Ethiopian Airlines", code: "ET" },
    { name: "Gol Linhas Aéreas", code: "G3" },
    { name: "Gulf Air", code: "GF" },
    { name: "Hawaiian Airlines", code: "HA" },
    { name: "JetBlue Airways", code: "B6" },
    { name: "KM Malta Airlines", code: "KM" },
    { name: "LATAM Airlines Group", code: "LA" },
    { name: "Lion Air", code: "JT" },
    { name: "Malindo Airways", code: "OD" },
    { name: "Oman Air", code: "WY" },
    { name: "Ravn Alaska", code: "7H" },
    { name: "Regional Express (Rex)", code: "ZL" },
    { name: "Scat Airlines", code: "DV" },
    { name: "Silver Airways", code: "3M" },
    { name: "Sky Airline", code: "H2" },
    { name: "Super Air Jet", code: "IU" },
    { name: "Thai Lion Air", code: "SL" },
    { name: "Virgin Australia", code: "VA" },
    { name: "WestJet", code: "WS" },
    { name: "Wings Air", code: "IW" },
    { name: "Zambia Airways", code: "ZN" },
    { name: "Department of National Defence", code: "YF" }
];

function injectCustomStyles() {
    window.addEventListener("click", () => {
        document.querySelectorAll(".futuristic-dropdown-menu").forEach(menu => menu.classList.remove("open"));
    });
}

function setupGlobalActions() {
    document.getElementById("btn-refresh-data").onclick = async () => {
        let cacheKey = currentMenuContext === "products" ? "salesforce_sid" : "salesforce_sid_airlines";
        let sidInput = localStorage.getItem(cacheKey);

        if (!sidInput || !sidInput.trim()) {
            let userSid = prompt("Paste your current Salesforce SID ('sid' cookie) here:");
            if (userSid === null || !userSid.trim()) {
                showToast("Sync Aborted: Salesforce SID token is required.", "error");
                return;
            }
            sidInput = userSid.trim();
            localStorage.setItem(cacheKey, sidInput);
        }

        showToast("Accessing Salesforce session... Synchronizing database.", "success");
        let result = null;

        if (currentMenuContext === "products") {
            result = await eel.trigger_salesforce_refresh(sidInput)();
        } else {
            result = await eel.trigger_airline_refresh(sidInput)();
        }

        if (result && result.success) {
            showToast(result.message, "success");
            await fetchDataFromBackend();
            if (currentTeam) selectProductTeam(currentTeam);
        } else {
            localStorage.removeItem(cacheKey);
            showToast(result ? result.error : "Sync operation failed. Please verify session in browser.", "error");
        }
    };

    document.getElementById("btn-back-to-grid").onclick = () => {
        const auditView = document.getElementById("view-audit-mode");
        if (auditView) {
            auditView.classList.remove("active");
            auditView.style.display = "none";
        }
        
        const gridView = document.getElementById("view-grid-mode");
        if (gridView) {
            gridView.classList.remove("inactive");
            gridView.style.display = "block";
        }
        
        if (currentMenuContext === "products") {
            const globalTimeframeCont = document.getElementById("global-timeframe-container");
            if (globalTimeframeCont) {
                globalTimeframeCont.style.display = "inline-flex";
            }
        }
        
        document.querySelectorAll(".submenu-item").forEach(item => item.classList.remove("active"));
    };

    document.getElementById("btn-execute-compare").onclick = executeCompareAnalysis;
}

// Expose function to open the OTP modal cleanly
eel.expose(open_otp_modal);
function open_otp_modal(reportId) {
    const overlay = document.getElementById("otp-modal-overlay");
    const input = document.getElementById("otp-input-code");
    const btnSubmit = document.getElementById("btn-otp-submit");
    const btnCancel = document.getElementById("btn-otp-cancel");

    if (!overlay || !input || !btnSubmit) {
        let code = prompt("Salesforce Security Verification:\n\nPlease insert your 6-digit verification code from your email:");
        eel.submit_sf_otp(code ? code.trim() : "");
        return;
    }

    input.value = "";
    overlay.style.display = "flex";
    setTimeout(() => input.focus(), 100);

    const handleSubmit = () => {
        const code = input.value.trim();
        cleanup();
        overlay.style.display = "none";
        eel.submit_sf_otp(code);
    };

    const handleCancel = () => {
        cleanup();
        overlay.style.display = "none";
        eel.submit_sf_otp("");
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleSubmit();
        else if (e.key === "Escape") handleCancel();
    };

    function cleanup() {
        btnSubmit.onclick = null;
        btnCancel.onclick = null;
        input.onkeydown = null;
    }

    btnSubmit.onclick = handleSubmit;
    btnCancel.onclick = handleCancel;
    input.onkeydown = handleKeyDown;
}

function setupInternalSidebarNavigation() {
    const btnCases = document.getElementById("audit-tab-cases");
    const btnChart = document.getElementById("audit-tab-chart");
    const btnJiras = document.getElementById("audit-tab-jiras");
    const btnEfficiency = document.getElementById("audit-tab-efficiency");
    const btnEvaluations = document.getElementById("audit-tab-evaluations"); 
    
    const viewCases = document.getElementById("audit-view-cases");
    const viewChart = document.getElementById("audit-view-chart");
    const viewJiras = document.getElementById("audit-view-jiras");
    const viewEfficiency = document.getElementById("audit-view-efficiency");
    const viewEvaluations = document.getElementById("audit-view-evaluations"); 

    const switchTab = (target) => {
        if (btnCases) btnCases.classList.remove("active");
        if (btnChart) btnChart.classList.remove("active");
        if (btnJiras) btnJiras.classList.remove("active");
        if (btnEfficiency) btnEfficiency.classList.remove("active");
        if (btnEvaluations) btnEvaluations.classList.remove("active"); 
        
        if (viewCases) viewCases.style.setProperty('display', 'none', 'important');
        if (viewChart) viewChart.style.setProperty('display', 'none', 'important');
        if (viewJiras) viewJiras.style.setProperty('display', 'none', 'important');
        if (viewEfficiency) viewEfficiency.style.setProperty('display', 'none', 'important');
        if (viewEvaluations) viewEvaluations.style.setProperty('display', 'none', 'important'); 

        if (target === "cases") {
            if (btnCases) btnCases.classList.add("active");
            if (viewCases) viewCases.style.setProperty('display', 'flex', 'important');
            
            currentAnalystCasesMode = "active";
            const btnActive = document.getElementById("btn-analyst-cases-active");
            const btnClosed = document.getElementById("btn-analyst-cases-closed");
            const timeframeContainer = document.getElementById("analyst-closed-timeframe-container");
            const quickActions = document.querySelector(".table-quick-actions");
            const scoreHeader = document.getElementById("th-score");
            const closedDateHeader = document.getElementById("th-closed-date");
            
            if (btnActive && btnClosed) {
                btnActive.classList.add("active"); btnActive.style.background = "#FFFFFF"; btnActive.style.color = "#1E293B"; btnActive.style.fontWeight = "700";
                btnClosed.classList.remove("active"); btnClosed.style.background = "transparent"; btnClosed.style.color = "#64748B"; btnClosed.style.fontWeight = "600";
            }
            if (timeframeContainer) timeframeContainer.style.display = "none";
            if (quickActions) quickActions.style.display = "flex";
            if (scoreHeader) scoreHeader.style.display = "";
            if (closedDateHeader) closedDateHeader.style.display = "none"; 
            
            if (auditContext === "team") displayTeamBacklog(); else displayAnalystBacklog();
        } else if (target === "jiras") {
            if (btnJiras) btnJiras.classList.add("active");
            if (viewJiras) viewJiras.style.setProperty('display', 'flex', 'important');
            displayAnalystJiraHealth();
        } else if (target === "efficiency") {
            if (btnEfficiency) btnEfficiency.classList.add("active");
            if (viewEfficiency) viewEfficiency.style.setProperty('display', 'flex', 'important');
            if (auditContext === "analyst") loadEfficiencyStats(activeTargetName, currentEfficiencyTimeframe); 
            else loadTeamEfficiencyStats(activeTargetName, currentEfficiencyTimeframe);
        } else if (target === "chart") {
            if (btnChart) btnChart.classList.add("active");
            if (viewChart) viewChart.style.setProperty('display', 'flex', 'important');
            setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 25);
            if (auditContext === "analyst") renderHistoricalChart(activeTargetName); else renderTeamHistoricalChart(activeTargetName);
        } else if (target === "evaluations") { 
            if (btnEvaluations) btnEvaluations.classList.add("active");
            if (viewEvaluations) viewEvaluations.style.setProperty('display', 'flex', 'important');
            loadEvaluationsTab(activeTargetName);
        }
    };

    if (btnCases) btnCases.onclick = () => switchTab("cases");
    if (btnChart) btnChart.onclick = () => switchTab("chart");
    if (btnJiras) btnJiras.onclick = () => switchTab("jiras");
    if (btnEfficiency) btnEfficiency.onclick = () => switchTab("efficiency");
    if (btnEvaluations) btnEvaluations.onclick = () => switchTab("evaluations"); 
}

async function selectProductTeam(teamName) {
    currentTeam = teamName;
    currentProductLevel = 3;
    
    const auditView = document.getElementById("view-audit-mode");
    if (auditView) { auditView.classList.remove("active"); auditView.style.display = "none"; }
    const gridView = document.getElementById("view-grid-mode");
    if (gridView) { gridView.classList.remove("inactive"); gridView.style.display = "block"; }
    
    const displayTeamName = getCleanProductName(teamName);
    const analysts = pipelineData[teamName];
    analysts.sort((a, b) => a.avg - b.avg);
    
    const safeTeamId = teamName.replace(/\s+/g, '-');
    document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
    document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));
    
    let targetSubmenu = document.getElementById(`sidebar-submenu-${safeTeamId}`);
    let targetBtn = document.getElementById(`sidebar-team-btn-${safeTeamId}`);
    if (targetSubmenu) targetSubmenu.classList.add('open');
    if (targetBtn) targetBtn.classList.add('active');

    const mainHeader = document.querySelector("#view-grid-mode .main-header");
    let btnBack = document.getElementById("btn-back-to-products");
    if (!btnBack) {
        btnBack = document.createElement("button");
		btnBack.id = "btn-back-to-products";
		btnBack.className = "btn btn-secondary";
        btnBack.style.cssText = "min-width: 170px; height: 42px; justify-content: center; align-items: center; margin-right: 20px;";
        mainHeader.insertBefore(btnBack, mainHeader.firstChild);
    }
    
    btnBack.style.display = "inline-flex";
    btnBack.innerText = `Back to Products`;
    btnBack.onclick = () => loadProductsOverview();

    let btnBackAir = document.getElementById("btn-back-to-airlines");
    if (btnBackAir) btnBackAir.style.display = "none";
    let btnClose = document.getElementById("btn-close-products");
    if (btnClose) btnClose.style.display = "none";

    const mainRefreshBtn = document.getElementById("btn-refresh-data");
    const globalTimeframeCont = document.getElementById("global-timeframe-container");
    if (mainRefreshBtn && mainRefreshBtn.parentElement) {
        mainRefreshBtn.parentElement.style.display = "none"; 
        mainRefreshBtn.style.display = "none";
    }
    if (globalTimeframeCont) globalTimeframeCont.style.display = "inline-flex";

    document.getElementById("selected-team-title").innerText = displayTeamName;
    document.getElementById("selected-team-stats").innerText = `Inspecting ${analysts.length} active analysts within ${displayTeamName}`;
    
    const globalActions = document.getElementById("global-actions");
	if (globalActions) {
		globalActions.style.display = "flex";
		globalActions.style.gap = "12px";
		globalActions.innerHTML = `
			<button id="btn-help-guide" class="btn btn-secondary" style="background: #E0F2FE; color: #0284C7; border: 1px solid #7DD3FC; font-weight: 700;" onclick="openHelpModal()">Score Guide</button>
			<button id="btn-bulk-export" class="btn btn-primary">Download Bulk Report</button>
			<button id="btn-team-matrix" class="btn btn-secondary">View Team Matrix</button>
		`;
	}
    document.getElementById("btn-bulk-export").onclick = () => triggerReportGeneration(teamName, null);
    document.getElementById("btn-team-matrix").onclick = () => openTeamMatrixDashboard(teamName);

    const gridContainer = document.getElementById("analysts-grid");
    gridContainer.style.cssText = ""; gridContainer.innerHTML = "";

    let existingTeamPanel = document.getElementById("team-efficiency-panel");
    if (existingTeamPanel) existingTeamPanel.remove();

    let teamPanel = document.createElement("div");
    teamPanel.id = "team-efficiency-panel";
    teamPanel.style.cssText = "margin: 0 40px 24px 40px; width: calc(100% - 80px);";
    gridContainer.parentNode.insertBefore(teamPanel, gridContainer);

    teamPanel.innerHTML = `<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px;"><div class="skeletal-block" style="height: 16px; width: 240px; margin: 0 auto 14px auto;"></div><div class="skeletal-block" style="height: 32px; width: 100%;"></div></div>`;

    eel.get_team_efficiency_stats(teamName, currentGlobalTimeframe)().then(res => {
        if (!res.success) return;
        let p30_val = parseFloat(res.p_30) || 0, p60_val = parseFloat(res.p_60) || 0, p90_val = parseFloat(res.p_90) || 0, pOver_val = parseFloat(res.p_over) || 0;

        teamPanel.innerHTML = `
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; display: flex; flex-direction: column;">
                <h3 style="text-align: center; color: #475569; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px;">Team Closure Aging Distribution Profile</h3>
                <div style="display: flex; width: 100%; height: 32px; background: #F1F5F9; border-radius: 6px; overflow: hidden; margin-bottom: 16px; border: 1px solid #E2E8F0;">
                    ${p30_val > 0 ? `<div style="width: ${p30_val}%; background: #D1FAE5; display: flex; align-items: center; justify-content: center; color: #065F46; font-size: 0.78rem; font-weight: 600;">${p30_val >= 6 ? `${res.p_30}%` : ''}</div>` : ''}
                    ${p60_val > 0 ? `<div style="width: ${p60_val}%; background: #CCFBF1; display: flex; align-items: center; justify-content: center; color: #075E54; font-size: 0.78rem; font-weight: 600;">${p60_val >= 6 ? `${res.p_60}%` : ''}</div>` : ''}
                    ${p90_val > 0 ? `<div style="width: ${p90_val}%; background: #FEF3C7; display: flex; align-items: center; justify-content: center; color: #92400E; font-size: 0.78rem; font-weight: 600;">${p90_val >= 6 ? `${res.p_90}%` : ''}</div>` : ''}
                    ${pOver_val > 0 ? `<div style="width: ${pOver_val}%; background: #FEE2E2; display: flex; align-items: center; justify-content: center; color: #991B1B; font-size: 0.78rem; font-weight: 600;">${pOver_val >= 6 ? `${res.p_over}%` : ''}</div>` : ''}
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;"><div style="width: 12px; height: 12px; background: #D1FAE5; border-radius: 2px;"></div><span style="color: #64748B;">Within 30 Days:</span><span style="color: #0F172A; font-weight: 600; margin-left: auto;">${res.c_30} cases (${res.p_30}%)</span></div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;"><div style="width: 12px; height: 12px; background: #CCFBF1; border-radius: 2px;"></div><span style="color: #64748B;">31 to 60 Days:</span><span style="color: #0F172A; font-weight: 600; margin-left: auto;">${res.c_60} cases (${res.p_60}%)</span></div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;"><div style="width: 12px; height: 12px; background: #FEF3C7; border-radius: 2px;"></div><span style="color: #64748B;">61 to 90 Days:</span><span style="color: #0F172A; font-weight: 600; margin-left: auto;">${res.c_90} cases (${res.p_90}%)</span></div>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;"><div style="width: 12px; height: 12px; background: #FEE2E2; border-radius: 2px;"></div><span style="color: #64748B;">Over 90 Days:</span><span style="color: #0F172A; font-weight: 600; margin-left: auto;">${res.c_over} cases (${res.p_over}%)</span></div>
                </div>
            </div>
        `;
    });

    analysts.forEach(analyst => {
        let scoreClass = "score-pill-inline";
        let scoreStyle = analyst.avg < 3.0 ? "background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;" : (analyst.avg < 5.0 ? "background: #FFEDD5; color: #C2410C; border: 1px solid #FDBA74;" : (analyst.avg < 7.0 ? "background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;" : (analyst.avg < 9.0 ? "background: #E0F2FE; color: #0369A1; border: 1px solid #7DD3FC;" : "background: #D1FAE5; color: #065F46; border: 1px solid #6EE7B7;")));

        let previewCases = analyst.all_cases.slice(0, 3);
        let casesHtml = analyst.all_cases && analyst.all_cases.length > 0 ? `
            <div class="top-cases-list" style="margin-top: 14px; border-top: 1px dashed #E2E8F0; padding-top: 10px;">
                <div style="font-size: 0.74rem; color: #64748B; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">📋 Urgent Backlog Preview:</div>
                ${previewCases.map(c => `<div class="case-item" style="display: flex; justify-content: space-between; font-size: 0.78rem; padding: 2px 0;"><span style="font-family: monospace; color: #334155; font-weight: 500;">${c.number}</span><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 65%; color: #64748B;" title="${c.subject}">${c.subject}</span></div>`).join('')}
            </div>
        ` : `<div style="text-align: center; margin-top: 14px; font-size: 0.78rem; color: #64748B; font-style: italic;">No active cases mapped</div>`;

        // 🟢 NUEVO: Formato integrado de Disapproved Jiras como un ítem de lista más (sin recuadro)
        let jiraListRow = "";
        if (analyst.disapproved_count > 0) {
            let breakdownList = "";
            if (analyst.disapproved_breakdown && Object.keys(analyst.disapproved_breakdown).length > 0) {
                breakdownList = `<div style="display: flex; flex-direction: column; gap: 2px; padding-left: 8px; border-left: 2px solid #E2E8F0; font-size: 0.78rem; margin-top: 2px;">`;
                for (const [reason, count] of Object.entries(analyst.disapproved_breakdown)) {
                    breakdownList += `<div style="display: flex; justify-content: space-between;"><span style="color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%;" title="${reason}">${reason}</span><span style="color: #991B1B; font-weight: 500;">${count} tkts</span></div>`;
                }
                breakdownList += `</div>`;
            }

            jiraListRow = `
                <div style="display: flex; justify-content: space-between;">
                    <span>Disapproved Jiras</span>
                    <span style="color: #991B1B; font-weight: 500;">${analyst.disapproved_count} tickets</span>
                </div>
                ${breakdownList}
            `;
        } else {
            jiraListRow = `
                <div style="display: flex; justify-content: space-between;">
                    <span>Disapproved Jiras</span>
                    <span style="color: #15803D; font-weight: 500;">0 tickets</span>
                </div>
            `;
        }
		
        let pillarsHtml = "";
        const checkNameUpper = analyst.name.trim().toUpperCase();
        if (!["GERARDO ESCUDERO", "MANOJ A", "MARIANNE DAJAS", "LUIS BRIOSSO"].includes(checkNameUpper)) {
            pillarsHtml = `
                <div style="margin-top: 10px; padding: 8px 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748B;"><span>Quality Score (45%)</span><span style="color: #2563EB; font-weight: 600;">${analyst.quality_score}</span></div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748B;"><span>Independency Score (15%)</span><span style="color: #D97706; font-weight: 600;">${analyst.independency_score}</span></div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748B;"><span>Productivity Score (40%)</span><span style="color: #16A34A; font-weight: 600;">${analyst.productivity_score}</span></div>
                </div>
            `;
        } else {
            pillarsHtml = `<div style="margin-top: 10px; text-align: center; font-size: 0.76rem; color: #64748B; font-style: italic; padding: 6px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;">Technical Lead Core Profile</div>`;
        }

        const card = document.createElement("div");
        card.className = "card";
        card.onclick = () => openAuditorView(analyst.name, teamName);

        card.innerHTML = `
            <div class="card-top" style="display: flex; flex-direction: column; height: 100%;">
                <h3 style="font-size: 1rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; color: #0F172A;">
                    <span>${analyst.name}</span>
                    <span class="${scoreClass}" style="font-size: 0.82rem; padding: 3px 8px; border-radius: 4px; font-weight: 600; ${scoreStyle}">Score: ${analyst.avg}</span>
                </h3>
                
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.82rem; color: #475569; border-top: 1px solid #F1F5F9; padding-top: 12px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Active Cases</span>
                        <span style="color: #0F172A; font-weight: 600;">${analyst.cases}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Monthly Close Avg</span>
                        <span style="color: #16A34A; font-weight: 600;">${analyst.monthly_closed_avg || 0} /mo</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Monthly Taken Avg</span>
                        <span style="color: #0284C7; font-weight: 600;">${analyst.monthly_taken_avg || 0} /mo</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Independency Rate</span>
                        <span style="color: #D97706; font-weight: 600;">${analyst.independency_rate}%</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; padding-left: 8px; border-left: 2px solid #E2E8F0; font-size: 0.78rem; margin-top: 2px;">
                        <span style="color: #64748B;">With JIRA</span>
                        <span style="color: #15803D; font-weight: 500;">${analyst.closed_with_jira || 0} cases</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding-left: 8px; border-left: 2px solid #E2E8F0; font-size: 0.78rem;">
                        <span style="color: #64748B;">Without JIRA (Auto)</span>
                        <span style="color: #991B1B; font-weight: 500;">${analyst.closed_without_jira || 0} cases</span>
                    </div>

                    ${jiraListRow}
                </div>
                
                ${pillarsHtml}
                ${casesHtml}
            </div>
            <div style="margin-top: auto; padding-top: 14px; width: 100%;">
                <button class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center; height: 32px; background: #FFFFFF; border: 1px solid #E2E8F0; color: #475569;" onclick="event.stopPropagation(); triggerReportGeneration('${teamName}', '${analyst.name}')">Download Report</button>
            </div>
        `;
        gridContainer.appendChild(card);
    });
}

async function fetchDataFromBackend() {
    let response = await eel.get_pipeline_data(currentGlobalTimeframe)();
    if (response.success) {
        pipelineData = response.data;
        teamScores = response.team_scores || {};
        airlinesData = response.airlines_data || {}; 
        
        let activeMatch = response.active_file.match(/\d+_\d+/);
        let closedMatch = response.closed_file.match(/\d+_\d+/);
        let airlineMatch = response.airline_file ? response.airline_file.match(/\d+_\d+/) : null;
        let jiraMatch = response.jira_file ? response.jira_file.match(/\d+_\d+/) : null; 

        let activeTimestamp = activeMatch ? activeMatch[0] + ".csv" : response.active_file;
        let closedTimestamp = closedMatch ? closedMatch[0] + ".csv" : response.closed_file;
        let airlineTimestamp = airlineMatch ? airlineMatch[0] + ".csv" : (response.airline_file || "No file detected");
        let jiraTimestamp = jiraMatch ? jiraMatch[0] + ".csv" : (response.jira_file || "No file detected"); 
        
        document.getElementById("target-file").innerHTML = `
            Active Cases: <span style="font-family: monospace;">${activeTimestamp}</span><br>
            Closed Cases: <span style="font-family: monospace;">${closedTimestamp}</span><br>
            Airline Cases: <span style="font-family: monospace;">${airlineTimestamp}</span><br>
            Jira Cases: <span style="font-family: monospace;">${jiraTimestamp}</span>
        `;
        renderSidebarMenu();
    } else {
        showToast(`Initialization Error: ${response.error}`, "error");
        document.getElementById("target-file").innerText = "Error streaming data source.";
    }
}

function renderSidebarMenu() {
    const menuContainer = document.getElementById("team-menu");
    menuContainer.innerHTML = "";

    const productsHeader = document.createElement("div");
    productsHeader.className = "sidebar-section-title";
    productsHeader.innerHTML = "Products";
    productsHeader.style.cssText = "cursor: pointer; transition: color 0.15s ease;";
    productsHeader.onmouseover = () => productsHeader.style.color = "#FFFFFF";
    productsHeader.onmouseout = () => productsHeader.style.color = "#64748B";

    const productsContainer = document.createElement("div");
    productsContainer.className = "sidebar-section-content";
    productsContainer.style.display = "none"; 

	productsHeader.onclick = () => {
			const isClosed = productsContainer.style.display === "none";
			
			const compareView = document.getElementById("view-compare-lab");
			if (compareView) compareView.style.display = "none";
			
			const auditView = document.getElementById("view-audit-mode");
			if (auditView) {
				auditView.classList.remove("active");
				auditView.style.display = "none";
			}
			
			const gridView = document.getElementById("view-grid-mode");
			if (gridView) {
				gridView.classList.remove("inactive");
				gridView.style.display = "block";
			}

			if (isClosed) {
				productsContainer.style.display = "flex";
				loadProductsOverview(); 
			} else {
				productsContainer.style.display = "none";
				document.getElementById("selected-team-title").innerText = "Select a Product Cell";
				document.getElementById("selected-team-stats").innerText = "Choose a category on the sidebar to inspect active analysts.";
				document.getElementById("analysts-grid").innerHTML = '<div class="empty-state-welcome"></div>';
				
				document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
				document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));
				
				const globalActions = document.getElementById("global-actions");
				if (globalActions) {
					globalActions.style.display = "none";
				}

				const btnBackProducts = document.getElementById("btn-back-to-products");
				if (btnBackProducts) {
					btnBackProducts.style.display = "none";
				}

				const btnBackAirlines = document.getElementById("btn-back-to-airlines");
				if (btnBackAirlines) {
					btnBackAirlines.style.display = "none";
				}

				const btnCloseProducts = document.getElementById("btn-close-products");
				if (btnCloseProducts) {
					btnCloseProducts.style.display = "none";
				}
				const timeframeContainer = document.getElementById("global-timeframe-container");
				if (timeframeContainer) {
					timeframeContainer.style.display = "none";
				}

				const existingTeamPanel = document.getElementById("team-efficiency-panel");
				if (existingTeamPanel) {
					existingTeamPanel.remove();
				}

				currentTeam = "";
				currentProductCategory = "";
				currentProductLevel = 1;
			}
		};
	
    menuContainer.appendChild(productsHeader);
    menuContainer.appendChild(productsContainer);

    const sortedTeams = Object.keys(pipelineData).sort((a, b) => (teamScores[a] || 10.0) - (teamScores[b] || 10.0));

    sortedTeams.forEach(team => {
        let displayTeamName = getCleanProductName(team);
        const safeTeamId = team.replace(/\s+/g, '-');
        const teamWrapper = document.createElement("div");
        teamWrapper.className = "team-container";

        const button = document.createElement("button");
        button.className = "menu-item";
        button.id = `sidebar-team-btn-${safeTeamId}`;
        button.style.cssText = "padding-left: 16px !important;"; 
        button.innerHTML = `<span style="flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayTeamName}</span>`;
        
        const submenu = document.createElement("div");
        submenu.className = "submenu-list";
        submenu.id = `sidebar-submenu-${safeTeamId}`;
        submenu.style.cssText = "padding-left: 12px !important;"; 

        const sortedAnalysts = [...pipelineData[team]].sort((a, b) => a.avg - b.avg);

        sortedAnalysts.forEach(analyst => {
            const subButton = document.createElement("button");
            subButton.className = "submenu-item";
            
            let subScoreColor = "var(--color-green)";
            if (analyst.avg < 3.0) subScoreColor = "var(--color-red)";
            else if (analyst.avg < 5.0) subScoreColor = "var(--color-orange)";
            else if (analyst.avg < 7.0) subScoreColor = "var(--color-yellow)";
            else if (analyst.avg < 9.0) subScoreColor = "var(--color-light-green)";

            subButton.innerHTML = `<span>${analyst.name}</span> <span style="font-weight: 700; color: ${subScoreColor}; font-size: 0.8rem;">${analyst.avg}</span>`;
            
            subButton.onclick = (e) => {
                e.stopPropagation(); 
                selectProductTeam(team);
                openAuditorView(analyst.name, team);
                document.querySelectorAll(".submenu-item").forEach(item => item.classList.remove("active"));
                subButton.classList.add("active");
            };
            submenu.appendChild(subButton);
        });
        
        button.onclick = () => {
            const isAlreadyActive = button.classList.contains("active");
            if (isAlreadyActive) {
                submenu.classList.remove("open");
                button.classList.remove("active");
                currentTeam = ""; 
                loadProductsOverview(); 
            } else {
                selectProductTeam(team);
            }
        };

        teamWrapper.appendChild(button);
        teamWrapper.appendChild(submenu);
        
        productsContainer.appendChild(teamWrapper);
    });

    const customersHeader = document.createElement("div");
    customersHeader.className = "sidebar-section-title";
    customersHeader.innerHTML = "Customers";
    customersHeader.style.cssText = "cursor: pointer; transition: color 0.15s ease;";
    customersHeader.onmouseover = () => customersHeader.style.color = "#FFFFFF";
    customersHeader.onmouseout = () => customersHeader.style.color = "#64748B";
    
    customersContainer = document.createElement("div");
    customersContainer.className = "sidebar-section-content";
    customersContainer.id = "customers-sidebar-section"; 
    customersContainer.style.display = "none"; 

    menuContainer.appendChild(customersHeader);
    menuContainer.appendChild(customersContainer);

    airlineList.forEach(airline => {
        const airButton = document.createElement("button");
        airButton.className = "submenu-item";
        airButton.style.cssText = "padding: 10px 16px; margin-left: 0px; border-left: 3px solid transparent; width: 100%; text-align: left;";
        airButton.innerHTML = `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 85%; font-weight: 500;">${airline.name}</span> <span style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: #64748B;">${airline.code}</span>`;
        
airButton.onclick = (e) => {
            e.stopPropagation();
            currentMenuContext = "customers";
            activeTargetName = airline.name;
            document.querySelectorAll(".submenu-item, .menu-item").forEach(item => item.classList.remove("active"));
            airButton.classList.add("active");
            document.getElementById("selected-team-title").innerText = airline.name;
            document.getElementById("selected-team-stats").innerText = `Inspecting records for ${airline.name} (${airline.code})`;
            document.getElementById("global-actions").style.display = "none";
            
            const mainHeader = document.querySelector("#view-grid-mode .main-header");
            let btnBackAir = document.getElementById("btn-back-to-airlines");
            if (!btnBackAir) {
                btnBackAir = document.createElement("button");
                btnBackAir.id = "btn-back-to-airlines";
                btnBackAir.className = "btn btn-secondary"; 
                btnBackAir.innerText = "Back to Portfolio";
                btnBackAir.style.cssText = "min-width: 170px; height: 42px; justify-content: center; align-items: center; margin-right: 20px;";
                mainHeader.insertBefore(btnBackAir, mainHeader.firstChild);
            }
            btnBackAir.style.display = "inline-flex";
            btnBackAir.onclick = () => loadCustomersOverview();

            let btnBackProd = document.getElementById("btn-back-to-products");
            if (btnBackProd) btnBackProd.style.display = "none";
            
            let btnCloseProd = document.getElementById("btn-close-products");
            if (btnCloseProd) btnCloseProd.style.display = "none";

            let btnCloseCust = document.getElementById("btn-close-customers");
            if (btnCloseCust) btnCloseCust.style.display = "none";
            
            const gridContainer = document.getElementById("analysts-grid");
            gridContainer.style.cssText = ""; 
            gridContainer.innerHTML = ""; 
            
            const matchData = airlinesData[airline.name] || { active_cases: 0, avg_score: 10.0, critical_cases: 0, total_closed_historical: 0, all_cases: [] };
            
            let productCounts = {};
            if (matchData.all_cases && matchData.all_cases.length > 0) {
                matchData.all_cases.forEach(c => {
                    const prod = c.product || "Unknown Product";
                    productCounts[prod] = (productCounts[prod] || 0) + 1;
                });
            }

            let breakdownHtml = "";
            if (Object.keys(productCounts).length > 0) {
                breakdownHtml = `<div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 18px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; margin-top: 4px;">
                    <h4 style="margin: 0; font-size: 0.88rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Active Backlog Distribution by Product Cell</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 12px;">`;

                for (const [prodName, count] of Object.entries(productCounts)) {
                    breakdownHtml += `
                        <div style="background: #FFFFFF; border: 1px solid #CBD5E1; padding: 8px 14px; border-radius: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <span style="color: #64748B; font-weight: 500;">${prodName}:</span>
                            <strong style="color: #E2553C; font-size: 0.9rem;">${count}</strong>
                        </div>`;
                }
                breakdownHtml += `</div></div>`;
            }
            
            const dashboardHtml = `
                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 26px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; flex-direction: column; width:100%; gap:24px;">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:20px; width:100%; height: auto;">
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:18px; border-radius:8px;">
                            <span style="font-size:0.78rem; font-weight:700; color:#64748B; text-transform:uppercase;">Active Caseload Pool</span>
                            <div style="font-size:1.8rem; font-weight:800; color:#1E3A8A; margin-top:6px;">${matchData.active_cases} <span style="font-size:0.9rem; font-weight:500; color:#64748B;">cases</span></div>
                        </div>
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:18px; border-radius:8px;">
                            <span style="font-size:0.78rem; font-weight:700; color:#64748B; text-transform:uppercase;">Caseload Health Score</span>
                            <div style="font-size:1.8rem; font-weight:800; color:#058146; margin-top:6px;">${matchData.avg_score} <span style="font-size:0.9rem; font-weight:500; color:#64748B;">avg</span></div>
                        </div>
                        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:18px; border-radius:8px;">
                            <span style="font-size:0.78rem; font-weight:700; color:#64748B; text-transform:uppercase;">Historical Resolved Log</span>
                            <div style="font-size:1.8rem; font-weight:800; color:#6D28D9; margin-top:6px;">${matchData.total_closed_historical} <span style="font-size:0.9rem; font-weight:500; color:#64748B;">cases</span></div>
                        </div>
                    </div>
                    ${breakdownHtml}
                </div>
            `;
            gridContainer.innerHTML = dashboardHtml;

            const existingTeamPanel = document.getElementById("team-efficiency-panel");
            if (existingTeamPanel) existingTeamPanel.remove();
            
            document.getElementById("view-audit-mode").classList.remove("active");
            document.getElementById("view-grid-mode").classList.remove("inactive");
        };
		
        customersContainer.appendChild(airButton);
    });

	customersHeader.onclick = () => {
			const isCollapsed = customersContainer.style.display === "none";

			const compareView = document.getElementById("view-compare-lab");
			if (compareView) {
				compareView.classList.remove("active");
				compareView.classList.add("inactive");
				compareView.style.display = "none";
			}
			const labHeader = document.getElementById("btn-open-compare-lab");
			if (labHeader) labHeader.classList.remove("active");

			const auditView = document.getElementById("view-audit-mode");
			if (auditView) {
				auditView.classList.remove("active");
				auditView.style.display = "none";
			}

			const gridView = document.getElementById("view-grid-mode");
			if (gridView) {
				gridView.classList.remove("inactive");
				gridView.style.display = "block";
			}

			if (isCollapsed) {
				if (productsContainer) productsContainer.style.display = "none";
				customersContainer.style.display = "flex";
				loadCustomersOverview();
			} else {
				customersContainer.style.display = "none";
				
				document.getElementById("selected-team-title").innerText = "Select a Product Cell";
				document.getElementById("selected-team-stats").innerText = "Choose a category on the sidebar to inspect active analysts.";
				document.getElementById("analysts-grid").innerHTML = '<div class="empty-state-welcome"></div>';
				
				document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
				document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));
				
				if (document.getElementById("btn-back-to-products")) document.getElementById("btn-back-to-products").style.display = "none";
				if (document.getElementById("btn-back-to-airlines")) document.getElementById("btn-back-to-airlines").style.display = "none";
				
				const btnCloseCustomers = document.getElementById("btn-close-customers");
				if (btnCloseCustomers) {
					btnCloseCustomers.style.display = "none";
				}

				const existingTeamPanel = document.getElementById("team-efficiency-panel");
				if (existingTeamPanel) {
					existingTeamPanel.remove();
				}
			}
		};

    const labHeader = document.createElement("div");
    labHeader.id = "btn-open-compare-lab";
    labHeader.className = "sidebar-section-title";
    labHeader.innerHTML = "LABORATORY";
    labHeader.style.cssText = "cursor: pointer; transition: color 0.15s ease;";
    labHeader.onmouseover = () => labHeader.style.color = "#FFFFFF";
    labHeader.onmouseout = () => labHeader.style.color = "#64748B";
    
labHeader.onclick = () => {
        const compareView = document.getElementById("view-compare-lab");
        const gridView = document.getElementById("view-grid-mode");
        const auditView = document.getElementById("view-audit-mode");

        if (!compareView || !gridView || !auditView) return;
		
        const globalTimeframeCont = document.getElementById("global-timeframe-container");
		
        if (globalTimeframeCont) globalTimeframeCont.style.display = "none";

        const isAlreadyActive = compareView.classList.contains("active");

        if (isAlreadyActive) {
            compareView.classList.remove("active");
            compareView.classList.add("inactive");
            compareView.style.display = "none";
            
            gridView.classList.remove("inactive");
            gridView.style.display = "block";
            
            auditView.classList.remove("active");
            auditView.style.display = "none";
            
            labHeader.classList.remove("active");
            
            if (typeof productsContainer !== 'undefined' && productsContainer) {
                productsContainer.style.display = "none";
            } else {
                const prodCont = document.querySelector(".sidebar-section-content");
                if (prodCont) prodCont.style.display = "none";
            }
            document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
            document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));
            
            document.getElementById("selected-team-title").innerText = "Select a Product Cell";
            document.getElementById("selected-team-stats").innerText = "Choose a category on the sidebar to inspect active analysts.";
            document.getElementById("analysts-grid").innerHTML = '<div class="empty-state-welcome"></div>';
            
            if (document.getElementById("btn-back-to-products")) {
                document.getElementById("btn-back-to-products").style.display = "none";
            }
            if (document.getElementById("btn-back-to-airlines")) {
                document.getElementById("btn-back-to-airlines").style.display = "none";
            }
            if (document.getElementById("btn-close-products")) {
                document.getElementById("btn-close-products").style.display = "none";
            }
            if (document.getElementById("btn-close-customers")) {
                document.getElementById("btn-close-customers").style.display = "none";
            }
            
            const globalActions = document.getElementById("global-actions");
            if (globalActions) {
                globalActions.style.display = "none";
            }
            
            const existingTeamPanel = document.getElementById("team-efficiency-panel");
            if (existingTeamPanel) {
                existingTeamPanel.remove();
            }

            currentTeam = "";
            currentProductCategory = "";
            currentProductLevel = 1;
        } else {
            gridView.classList.add("inactive");
            auditView.classList.remove("active");
            
            gridView.style.display = "none";
            auditView.style.display = "none";
            
            compareView.classList.remove("inactive");
            compareView.classList.add("active");
            compareView.style.display = "block";
            
            document.querySelectorAll(".menu-item, .submenu-item").forEach(b => b.classList.remove("active"));
            labHeader.classList.add("active");
            
            const btnBack = document.getElementById("btn-compare-back");
            if (btnBack) {
                btnBack.style.display = "none"; 
                btnBack.onclick = navigateCompareBack;
            }
            
            currentCompareLevel = 1;
            compareContext = "";
            selectedContenders = [];
            currentCompareTab = "active_backlog";
            
            document.getElementById("compare-lab-title").innerText = "LABORATORY";
            document.getElementById("compare-lab-subtitle").innerText = "Select a category to start the comparative analysis.";
            document.getElementById("compare-level-1").style.display = "grid"; 
            document.getElementById("compare-level-2").style.display = "none";
            document.getElementById("compare-level-3").style.display = "none";
        }
    };
	
    menuContainer.appendChild(labHeader);
}

function loadProductsOverview() {
    currentMenuContext = "products";
    currentTeam = "";
    currentProductLevel = 1;
    currentProductCategory = "";
	
    const globalTimeframeCont = document.getElementById("global-timeframe-container");
    if (globalTimeframeCont) globalTimeframeCont.style.display = "inline-flex";
	
    document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
    document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));

    const btnBack = document.getElementById("btn-back-to-products");
    if (btnBack) btnBack.style.display = "none";
	const btnCloseAir = document.getElementById("btn-close-customers");
	if (btnCloseAir) btnCloseAir.style.display = "none";
    let btnBackAir = document.getElementById("btn-back-to-airlines");
    if (btnBackAir) btnBackAir.style.display = "none";

    const mainHeader = document.querySelector("#view-grid-mode .main-header");
    let btnClose = document.getElementById("btn-close-products");
    
    if (!btnClose) {
        btnClose = document.createElement("button");
        btnClose.id = "btn-close-products";
        btnClose.className = "btn btn-secondary"; 
        btnClose.style.cssText = "min-width: 150px; height: 42px; justify-content: center; align-items: center; margin-right: 20px;";
        mainHeader.insertBefore(btnClose, mainHeader.firstChild);
    }
    
    btnClose.style.display = "inline-flex";
    btnClose.innerText = "Close Portfolio";
    
    btnClose.onclick = () => {
        const productsCont = document.querySelector(".sidebar-section-content");
        if (productsCont) productsCont.style.display = "none";
        
        const globalTimeframeCont = document.getElementById("global-timeframe-container");
        if (globalTimeframeCont) {
            globalTimeframeCont.style.display = "none";
        }
        
        document.getElementById("selected-team-title").innerText = "Select a Product Cell";
        document.getElementById("selected-team-stats").innerText = "Choose a category on the sidebar to inspect active analysts.";
        document.getElementById("analysts-grid").innerHTML = '<div class="empty-state-welcome"></div>';
        
        document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
        document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));
        
        const globalActions = document.getElementById("global-actions");
        if (globalActions) globalActions.style.display = "none";
        btnClose.style.display = "none";
        
        currentTeam = "";
        currentProductCategory = "";
        currentProductLevel = 1;
    };

    const mainRefreshBtn = document.getElementById("btn-refresh-data");
	if (mainRefreshBtn) {
		if (mainRefreshBtn.parentElement) {
			mainRefreshBtn.parentElement.style.display = "inline-flex"; 
		}
		mainRefreshBtn.style.display = "inline-flex";
		mainRefreshBtn.innerText = "Refresh System Data";
		const mainTooltip = mainRefreshBtn.nextElementSibling;
		if (mainTooltip) mainTooltip.style.removeProperty('display');
	}

    document.getElementById("selected-team-title").innerText = "PRODUCTS";
    document.getElementById("selected-team-stats").innerText = "Operational metrics and performance ratings across all active product cells.";
    const globalActions = document.getElementById("global-actions");
		if (globalActions) {
			globalActions.style.display = "flex";
			globalActions.style.gap = "12px";
			globalActions.innerHTML = `
				<button id="btn-help-guide" class="btn btn-secondary" style="background: #E0F2FE; color: #0284C7; border: 1px solid #7DD3FC; font-weight: 700;" onclick="openHelpModal()">Score Guide</button>
			`;
		}
    
    const existingTeamPanel = document.getElementById("team-efficiency-panel");
    if (existingTeamPanel) existingTeamPanel.remove();

    document.getElementById("view-audit-mode").classList.remove("active");
    document.getElementById("view-grid-mode").classList.remove("inactive");

    const gridContainer = document.getElementById("analysts-grid");
    gridContainer.style.cssText = ""; 
    gridContainer.innerHTML = "";

    const sortedTeams = Object.keys(pipelineData).sort((a, b) => (teamScores[a] || 10.0) - (teamScores[b] || 10.0));

    sortedTeams.forEach(team => {
        const displayTeamName = getCleanProductName(team);
        let totalCases = pipelineData[team].reduce((acc, curr) => acc + curr.cases, 0);
        let scoreMacro = teamScores[team] || 10.0;
        
        let scoreStyle = "";
        if (scoreMacro < 3.0) scoreStyle = "background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;";
        else if (scoreMacro < 5.0) scoreStyle = "background: #FFEDD5; color: #C2410C; border: 1px solid #FDBA74;";
        else if (scoreMacro < 7.0) scoreStyle = "background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;";
        else if (scoreMacro < 9.0) scoreStyle = "background: #E0F2FE; color: #0369A1; border: 1px solid #7DD3FC;";
        else scoreStyle = "background: #D1FAE5; color: #065F46; border: 1px solid #6EE7B7;";

        const headcount = pipelineData[team].length;
        let healthyCasesCount = 0;
        let teamClosedWithJira = 0;
        let teamClosedWithoutJira = 0;
        let teamDisapprovedJiras = 0; // 🟢 Suma acumulada de Jiras desaprobados del equipo

        let mvdHeadcount = 0, blrHeadcount = 0;
        let mvdClosedAvg = 0, blrClosedAvg = 0;
        let mvdTakenAvg = 0, blrTakenAvg = 0;
        let totalClosedAvg = 0;
        let totalTakenAvg = 0;

        pipelineData[team].forEach(analyst => {
            if (analyst.location === "MVD") {
                mvdHeadcount++;
                mvdClosedAvg += (analyst.monthly_closed_avg || 0);
                mvdTakenAvg += (analyst.monthly_taken_avg || 0);
            } else if (analyst.location === "BLR") {
                blrHeadcount++;
                blrClosedAvg += (analyst.monthly_closed_avg || 0);
                blrTakenAvg += (analyst.monthly_taken_avg || 0);
            }
            totalClosedAvg += (analyst.monthly_closed_avg || 0);
            totalTakenAvg += (analyst.monthly_taken_avg || 0);

            if (analyst.all_cases) {
                healthyCasesCount += analyst.all_cases.filter(c => c.color === "GREEN" || c.color === "LIGHT_GREEN").length;
            }
            teamClosedWithJira += (analyst.closed_with_jira || 0);
            teamClosedWithoutJira += (analyst.closed_without_jira || 0);
            teamDisapprovedJiras += (analyst.disapproved_count || 0); // 🟢 Acumular total por analista
        });

        let teamAgentClosedAvg = headcount > 0 ? (totalClosedAvg / headcount).toFixed(1) : "0.0";
        let teamAgentTakenAvg = headcount > 0 ? (totalTakenAvg / headcount).toFixed(1) : "0.0";

        let totalTeamClosed = teamClosedWithJira + teamClosedWithoutJira;
        let teamIndependenceRate = totalTeamClosed > 0 ? ((teamClosedWithoutJira / totalTeamClosed) * 100).toFixed(0) : "100";
        let queueHealthIndex = totalCases > 0 ? ((healthyCasesCount / totalCases) * 100).toFixed(0) : "100";

        const card = document.createElement("div");
        card.className = "card product-macro-cell";
        card.style.cssText = "cursor: pointer; padding: 20px; border: 1px solid #E2E8F0; background: #FFFFFF; border-radius: 12px; display: flex; flex-direction: column; height: 100%; transition: all 0.2s ease;";
        
        card.innerHTML = `
			<div class="card-top" style="display: flex; flex-direction: column; flex-grow: 1;">
				<h3 style="font-size: 1.05rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; color: var(--text-dark);">
					<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayTeamName}">${displayTeamName}</span>
					<span style="font-size: 0.82rem; padding: 3px 8px; border-radius: 4px; font-weight: 600; ${scoreStyle}">Score: ${scoreMacro}</span>
				</h3>
                
                <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.82rem; color: var(--text-muted);">
					<div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
						<div style="display: flex; justify-content: space-between;">
							<span>Total Pool Caseload</span>
							<span style="color: var(--primary); font-weight: 600;">${totalCases} cases</span>
						</div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Active Headcount</span>
                            <span style="color: #0F172A; font-weight: 500;">${headcount} Analysts (MVD: ${mvdHeadcount} / BLR: ${blrHeadcount})</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid #F1F5F9;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Monthly Closed Output</span>
                            <span style="color: #16A34A; font-weight: 600;">${totalClosedAvg.toFixed(1)} /mo</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Monthly Taken Output</span>
                            <span style="color: #0284C7; font-weight: 600;">${totalTakenAvg.toFixed(1)} /mo</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid #F1F5F9;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Avg Closed / Agent</span>
                            <span style="color: #16A34A; font-weight: 500;">${teamAgentClosedAvg} /mo</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Avg Taken / Agent</span>
                            <span style="color: #0284C7; font-weight: 500;">${teamAgentTakenAvg} /mo</span>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid #F1F5F9;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Autonomous Closures (No JIRA)</span>
                            <span style="color: #991B1B; font-weight: 500;">${teamClosedWithoutJira} cases</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Closures With JIRA</span>
                            <span style="color: #15803D; font-weight: 500;">${teamClosedWithJira} cases</span>
                        </div>
                        <!-- 🟢 NUEVO FIELD: Total Disapproved Jiras por equipo -->
                        <div style="display: flex; justify-content: space-between;">
                            <span>Disapproved Jiras</span>
                            <span style="color: ${teamDisapprovedJiras > 0 ? '#991B1B' : '#15803D'}; font-weight: 500;">${teamDisapprovedJiras} tickets</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Team Independence</span>
                            <span style="color: #D97706; font-weight: 600;">${teamIndependenceRate}%</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span>Queue Health Rating</span>
                        <span style="color: ${queueHealthIndex >= 75 ? '#16A34A' : '#991B1B'}; font-weight: 600;">${queueHealthIndex}% Healthy</span>
                    </div>
                </div>
            </div>
        `;
        card.onclick = () => selectProductTeam(team);
        gridContainer.appendChild(card);
    });
}

function loadCustomersOverview() {
    currentMenuContext = "customers";
    currentTeam = "";
    
    const globalTimeframeCont = document.getElementById("global-timeframe-container");
    if (globalTimeframeCont) globalTimeframeCont.style.display = "none";

    document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
    document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));

    const btnBack = document.getElementById("btn-back-to-products");
    if (btnBack) btnBack.style.display = "none";
    const btnBackAir = document.getElementById("btn-back-to-airlines");
    if (btnBackAir) btnBackAir.style.display = "none";
    const btnCloseProd = document.getElementById("btn-close-products");
    if (btnCloseProd) btnCloseProd.style.display = "none";

    const mainHeader = document.querySelector("#view-grid-mode .main-header");
    let btnClose = document.getElementById("btn-close-customers");
    
    if (!btnClose) {
        btnClose = document.createElement("button");
        btnClose.id = "btn-close-customers";
        btnClose.className = "btn btn-secondary"; 
        btnClose.style.cssText = "min-width: 150px; height: 42px; justify-content: center; align-items: center; margin-right: 20px;";
        mainHeader.insertBefore(btnClose, mainHeader.firstChild);
    }
    
    btnClose.style.display = "inline-flex";
    btnClose.innerText = "Close Customers";
    
    btnClose.onclick = () => {
        const customersCont = document.getElementById("customers-sidebar-section");
        if (customersCont) customersCont.style.display = "none";
        
        document.getElementById("selected-team-title").innerText = "Select a Product Cell";
        document.getElementById("selected-team-stats").innerText = "Choose a category on the sidebar to inspect active analysts.";
        document.getElementById("analysts-grid").innerHTML = '<div class="empty-state-welcome"></div>';
        
        document.querySelectorAll(".submenu-list").forEach(sub => sub.classList.remove("open"));
        document.querySelectorAll(".menu-item, .submenu-item").forEach(item => item.classList.remove("active"));
        
        const globalActions = document.getElementById("global-actions");
        if (globalActions) globalActions.style.display = "none";
        btnClose.style.display = "none";
        
        currentTeam = "";
    };

    const mainRefreshBtn = document.getElementById("btn-refresh-data");
	if (mainRefreshBtn) {
		if (mainRefreshBtn.parentElement) {
			mainRefreshBtn.parentElement.style.display = "inline-flex"; 
		}
		mainRefreshBtn.style.display = "inline-flex";
		mainRefreshBtn.innerText = "Refresh Airline Data";
	}

    document.getElementById("selected-team-title").innerText = "CUSTOMERS & AIRLINES";
    document.getElementById("selected-team-stats").innerText = "Operational metrics and performance ratings across all airline accounts.";
    document.getElementById("global-actions").style.display = "none";
    
    const existingTeamPanel = document.getElementById("team-efficiency-panel");
    if (existingTeamPanel) existingTeamPanel.remove();

    document.getElementById("view-audit-mode").classList.remove("active");
    document.getElementById("view-grid-mode").classList.remove("inactive");

    const gridContainer = document.getElementById("analysts-grid");
    gridContainer.style.cssText = ""; 
    gridContainer.innerHTML = "";

    const sortedAirlines = [...airlineList].sort((a, b) => {
        const dataA = airlinesData[a.name] || { avg_score: 10.0 };
        const dataB = airlinesData[b.name] || { avg_score: 10.0 };
        return (dataA.avg_score || 10.0) - (dataB.avg_score || 10.0);
    });

    sortedAirlines.forEach(airline => {
        const matchData = airlinesData[airline.name] || { active_cases: 0, avg_score: 10.0, critical_cases: 0, total_closed_historical: 0 };
        let scoreMacro = matchData.avg_score;
        
        let scoreStyle = "";
        if (scoreMacro < 3.0) scoreStyle = "background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;";
        else if (scoreMacro < 5.0) scoreStyle = "background: #FFEDD5; color: #C2410C; border: 1px solid #FDBA74;";
        else if (scoreMacro < 7.0) scoreStyle = "background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;";
        else if (scoreMacro < 9.0) scoreStyle = "background: #E0F2FE; color: #0369A1; border: 1px solid #7DD3FC;";
        else scoreStyle = "background: #D1FAE5; color: #065F46; border: 1px solid #6EE7B7;";

        const card = document.createElement("div");
        card.className = "card product-macro-cell";
        card.style.cssText = "cursor: pointer; padding: 20px; border: 1px solid #E2E8F0; background: #FFFFFF; border-radius: 12px; display: flex; flex-direction: column; height: 100%; transition: all 0.2s ease;";
        
        card.innerHTML = `
            <div class="card-top" style="display: flex; flex-direction: column; flex-grow: 1;">
                <h3 style="font-size: 1.05rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; color: var(--text-dark); border-bottom: none; gap: 4px;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%;" title="${airline.name}">${airline.name}</span>
                    <span style="font-size: 0.82rem; padding: 3px 8px; border-radius: 4px; font-weight: 600; ${scoreStyle}">Score: ${scoreMacro}</span>
                </h3>
                
                <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.82rem; color: var(--text-muted);">
                    <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Active Caseload Pool</span>
                            <span style="color: var(--primary); font-weight: 600;">${matchData.active_cases} cases</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Critical Backlog Warnings</span>
                            <span style="color: var(--color-red); font-weight: 600;">${matchData.critical_cases} cases</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; padding-bottom: 4px;">
                        <span>Historical Closed</span>
                        <span style="color: #6D28D9; font-weight: 600;">${matchData.total_closed_historical} cases</span>
                    </div>
                </div>
            </div>
        `;
        
        card.onclick = () => {
            const sidebarButtons = document.querySelectorAll("#customers-sidebar-section button");
            for (let btn of sidebarButtons) {
                if (btn.innerText.includes(airline.name)) {
                    btn.click();
                    break;
                }
            }
        };
        gridContainer.appendChild(card);
    });
}

function openAuditorView(analystName, teamName) {
    currentAnalystCasesMode = "active";
    currentAnalystClosedTimeframe = "12";
    jiraHealthSubTab = "table"; 
    auditContext = "analyst"; // 🟢 Marca explícita
    activeTargetName = analystName;
    currentTeam = teamName; 

    const timeframeContainer = document.getElementById("analyst-closed-timeframe-container");
    if (timeframeContainer) timeframeContainer.style.display = "none";
    
    const quickActions = document.querySelector(".table-quick-actions");
    const scoreHeader = document.getElementById("th-score");
    const closedDateHeader = document.getElementById("th-closed-date"); 
    
    if (quickActions) quickActions.style.display = "flex";
    if (scoreHeader) scoreHeader.style.display = "";
    if (closedDateHeader) closedDateHeader.style.display = "none"; 
    
    const btnActive = document.getElementById("btn-analyst-cases-active");
    const btnClosed = document.getElementById("btn-analyst-cases-closed");
    if (btnActive && btnClosed) {
        btnActive.classList.add("active"); btnActive.style.background = "#FFFFFF"; btnActive.style.color = "#1E293B"; btnActive.style.fontWeight = "700";
        btnClosed.classList.remove("active"); btnClosed.style.background = "transparent"; btnClosed.style.color = "#64748B"; btnClosed.style.fontWeight = "600";
    }

    const activeModal = document.getElementById("critical-cases-modal-overlay");
    if (activeModal) activeModal.remove();

    const globalTimeframeCont = document.getElementById("global-timeframe-container");
    if (globalTimeframeCont) globalTimeframeCont.style.display = "none";

    const btnCases = document.getElementById("audit-tab-cases");
    const btnChart = document.getElementById("audit-tab-chart");
    const btnJiras = document.getElementById("audit-tab-jiras");
    const btnEfficiency = document.getElementById("audit-tab-efficiency");
    const btnEvaluations = document.getElementById("audit-tab-evaluations");

    if (btnCases) btnCases.innerText = "Cases";
    if (btnChart) btnChart.innerText = "Productivity";
    if (btnEfficiency) btnEfficiency.innerText = "Efficiency";
    if (btnEvaluations) btnEvaluations.innerText = "Evaluations";

    if (btnCases) btnCases.classList.add("active");
    if (btnChart) btnChart.classList.remove("active");
    if (btnJiras) btnJiras.classList.remove("active");
    if (btnEfficiency) btnEfficiency.classList.remove("active");
    if (btnEvaluations) btnEvaluations.classList.remove("active");

    if (btnCases) btnCases.style.display = "block";
    if (btnChart) btnChart.style.display = "block";
    if (btnJiras) btnJiras.style.display = "block";
    if (btnEfficiency) btnEfficiency.style.display = "block"; 
    if (btnEvaluations) btnEvaluations.style.display = "block"; 

    const viewCases = document.getElementById("audit-view-cases");
    const viewChart = document.getElementById("audit-view-chart");
    const viewJiras = document.getElementById("audit-view-jiras");
    const viewEfficiency = document.getElementById("audit-view-efficiency");
    const viewEvaluations = document.getElementById("audit-view-evaluations");

    if (viewCases) viewCases.style.setProperty('display', 'flex', 'important');
    if (viewChart) viewChart.style.setProperty('display', 'none', 'important');
    if (viewJiras) viewJiras.style.setProperty('display', 'none', 'important');
    if (viewEfficiency) viewEfficiency.style.setProperty('display', 'none', 'important');
    if (viewEvaluations) viewEvaluations.style.setProperty('display', 'none', 'important');

    const auditView = document.getElementById("view-audit-mode");
    const gridView = document.getElementById("view-grid-mode");

    if (gridView) gridView.classList.add("inactive");
    if (auditView) {
        auditView.classList.add("active");
        auditView.style.setProperty('display', 'flex', 'important');
    }

    const analystObj = pipelineData[teamName].find(a => a.name === analystName);
    if (!analystObj) return;

    document.getElementById("audit-analyst-title").innerText = analystObj.name.toUpperCase();
    document.getElementById("audit-analyst-stats").innerText = `Operational health matrix analysis for ${teamName} product`;
    document.getElementById("btn-audit-download").onclick = () => triggerReportGeneration(teamName, analystName);

    let bracketColor = "GREEN";
    if (analystObj.avg < 3.0) bracketColor = "RED";
    else if (analystObj.avg < 5.0) bracketColor = "ORANGE";
    else if (analystObj.avg < 7.0) bracketColor = "YELLOW";
    else if (analystObj.avg < 9.0) bracketColor = "LIGHT_GREEN";

    const kpiBlock = document.getElementById("audit-kpi-block");
    if (kpiBlock) {
        kpiBlock.className = `kpi-banner-strip status-${bracketColor}`;
    }
    document.getElementById("audit-kpi-avg").innerText = analystObj.avg;
    document.getElementById("audit-kpi-cases").innerText = analystObj.cases;

    displayAnalystBacklog();
}

function displayAnalystBacklog() {
	if (window.clearCopySelections) window.clearCopySelections();
    const analystObj = pipelineData[currentTeam].find(a => a.name === activeTargetName);
    if (!analystObj) return;
    currentDisplayedCases = analystObj.all_cases;
    
    const oldTopFilter = document.getElementById("cases-filter-container");
    if (oldTopFilter) oldTopFilter.remove();

    activeFilters = { account: "ALL", status: "ALL", sub_status: "ALL", alert: "ALL" };
    
    buildHeaderFilters();
    applyFiltersAndRender();
}

function openTeamMatrixDashboard(teamName) {
    auditContext = "team"; // 🟢 Marca explícita
    activeTargetName = teamName;
    jiraHealthSubTab = "table";

    const auditView = document.getElementById("view-audit-mode");
    const gridView = document.getElementById("view-grid-mode");
    
    if (gridView) gridView.classList.add("inactive");
    if (auditView) {
        auditView.classList.add("active");
        auditView.style.setProperty('display', 'flex', 'important');
    }

    document.getElementById("audit-analyst-title").innerText = `Team Matrix: ${teamName}`;
    document.getElementById("audit-analyst-stats").innerText = `Group operational intelligence and pooled resolution metrics for the entire cell`;
    document.getElementById("btn-audit-download").onclick = () => triggerReportGeneration(teamName, null);

    const kpiBlock = document.getElementById("audit-kpi-block");
    if (kpiBlock) {
        kpiBlock.className = "kpi-banner-strip"; 
    }
    
    let consolidatedActiveVolume = pipelineData[teamName].reduce((sum, item) => sum + parseInt(item.cases), 0);
    let pooledTeamCaseloadAvgScore = teamScores[teamName] || "10.0";
    
    document.getElementById("audit-kpi-avg").innerText = pooledTeamCaseloadAvgScore;
    document.getElementById("audit-kpi-cases").innerText = consolidatedActiveVolume;

    const btnCases = document.getElementById("audit-tab-cases");
    const btnChart = document.getElementById("audit-tab-chart");
    const btnJiras = document.getElementById("audit-tab-jiras");
    const btnEfficiency = document.getElementById("audit-tab-efficiency");
    const btnEvaluations = document.getElementById("audit-tab-evaluations");

    if (btnCases) btnCases.innerText = "Team Backlog";
    if (btnChart) btnChart.innerText = "Team Productivity";
    if (btnEfficiency) btnEfficiency.innerText = "Team Efficiency";
    if (btnEvaluations) btnEvaluations.innerText = "Team Evaluations";

    if (btnCases) btnCases.classList.add("active");
    if (btnChart) btnChart.classList.remove("active");
    if (btnJiras) btnJiras.classList.remove("active");
    if (btnEfficiency) btnEfficiency.classList.remove("active");
    if (btnEvaluations) btnEvaluations.classList.remove("active");

    if (btnCases) btnCases.style.display = "block";
    if (btnChart) btnChart.style.display = "block";
    if (btnJiras) btnJiras.style.display = "block";
    if (btnEfficiency) btnEfficiency.style.display = "block"; 
    if (btnEvaluations) btnEvaluations.style.display = "block"; 

    const viewCases = document.getElementById("audit-view-cases");
    const viewChart = document.getElementById("audit-view-chart");
    const viewJiras = document.getElementById("audit-view-jiras");
    const viewEfficiency = document.getElementById("audit-view-efficiency");
    const viewEvaluations = document.getElementById("audit-view-evaluations");

    if (viewCases) viewCases.style.setProperty('display', 'flex', 'important');
    if (viewChart) viewChart.style.setProperty('display', 'none', 'important');
    if (viewJiras) viewJiras.style.setProperty('display', 'none', 'important');
    if (viewEfficiency) viewEfficiency.style.setProperty('display', 'none', 'important');
    if (viewEvaluations) viewEvaluations.style.setProperty('display', 'none', 'important');

    displayTeamBacklog();
}

function displayTeamBacklog() {
    const tbody = document.getElementById("audit-table-body");
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">Loading team backlog grid parameters...</td></tr>`;

    let timeframe = document.getElementById("chart-timeframe-select")?.value || "YTD";

    eel.get_team_comprehensive_analytics(activeTargetName, timeframe)().then(res => {
        if (!res.success) {
            showToast(`Analytics Pipeline Fault: ${res.error}`, "error");
            return;
        }
        currentDisplayedCases = res.active_backlog;
        
        const oldTopFilter = document.getElementById("cases-filter-container");
        if (oldTopFilter) oldTopFilter.remove();

        activeFilters = { account: "ALL", status: "ALL", sub_status: "ALL", alert: "ALL" };
        
        buildHeaderFilters();
        applyFiltersAndRender();
    });
}

function injectTimeframeSelectorElement() {
    const canvas = document.getElementById('analystClosureChart');
    if (!canvas) return;
    
    const chartCard = document.getElementById("audit-view-chart") || canvas.closest('.historical-chart-card-full') || canvas.closest('.card') || canvas.parentNode;
    if (!chartCard) return;

    let wrapper = document.getElementById("chart-controls-wrapper");
    let controlContainer = document.getElementById("chart-dropdowns-container");

    window.currentChartTimeframe = window.currentChartTimeframe || "YTD";

    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "chart-controls-wrapper";
        wrapper.style.cssText = "display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;";
        
        const h3 = chartCard.querySelector('h3');
        if (h3) {
            chartCard.insertBefore(wrapper, h3);
            wrapper.appendChild(h3);
        } else {
            chartCard.insertBefore(wrapper, chartCard.firstChild);
            const defaultH3 = document.createElement("h3");
            defaultH3.style.cssText = "margin: 0; font-size: 1.1rem; font-weight: 700; color: #1E293B;";
            wrapper.appendChild(defaultH3);
        }
        
        controlContainer = document.createElement("div");
        controlContainer.id = "chart-dropdowns-container";
        controlContainer.style.cssText = "display: flex; flex-direction: column; gap: 8px; align-items: flex-end; justify-content: center;";
        wrapper.appendChild(controlContainer);
    }

    if (controlContainer) {
        controlContainer.innerHTML = ""; 

        if (auditContext === "team") {
            const modeBar = document.createElement("div");
            modeBar.style.cssText = "display: inline-flex; background: #FBECE9; padding: 3px; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); gap: 4px; flex-wrap: wrap;";
            
            const modeOptions = [
                { id: "bar", label: "Team Combined" },
                { id: "line_closed", label: "Analyst: Closed" },
                { id: "line_taken", label: "Analyst: Taken" },
                { id: "line_with_jira", label: "Closed w/ JIRA" },
                { id: "line_without_jira", label: "Closed w/o JIRA" }
            ];

            modeOptions.forEach(opt => {
                const btn = document.createElement("button");
                btn.innerText = opt.label;
                
                if (currentTeamChartMode === "line") currentTeamChartMode = "line_closed";

                const isActive = currentTeamChartMode === opt.id;
                if (isActive) {
                    btn.style.cssText = "background: #FFFFFF; color: var(--primary); border: 1px solid var(--border-color); box-shadow: 0 1px 3px rgba(0,0,0,0.06); padding: 5px 14px; font-size: 0.78rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";
                } else {
                    btn.style.cssText = "background: transparent; color: #71717A; border: 1px solid transparent; padding: 5px 14px; font-size: 0.78rem; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";
                }

                btn.onclick = () => {
                    currentTeamChartMode = opt.id;
                    renderTeamHistoricalChart(activeTargetName);
                };
                modeBar.appendChild(btn);
            });
            controlContainer.appendChild(modeBar);
        }

        const timeframeBar = document.createElement("div");
        timeframeBar.style.cssText = "display: inline-flex; background: #F4F4F5; padding: 3px; border-radius: 8px; border: 1px solid #E4E4E7; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);";
        
        const timeframeOptions = [
            { id: "YTD", label: "YTD" },
            { id: "3", label: "3 Months" },
            { id: "6", label: "6 Months" },
            { id: "12", label: "12 Months" },
            { id: "24", label: "24 Months" }
        ];

        timeframeOptions.forEach(opt => {
            const btn = document.createElement("button");
            btn.innerText = opt.label;

            if (opt.id === window.currentChartTimeframe) {
                btn.style.cssText = "background: #FFFFFF; color: var(--primary); border: 1px solid var(--border-color); box-shadow: 0 1px 3px rgba(0,0,0,0.06); padding: 5px 14px; font-size: 0.78rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";
            } else {
                btn.style.cssText = "background: transparent; color: #71717A; border: 1px solid transparent; padding: 5px 14px; font-size: 0.78rem; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";
            }

            btn.onclick = () => {
                window.currentChartTimeframe = opt.id;
                if (auditContext === "analyst") renderHistoricalChart(activeTargetName);
                else renderTeamHistoricalChart(activeTargetName);
            };
            timeframeBar.appendChild(btn);
        });
        controlContainer.appendChild(timeframeBar);
    }
}

async function renderHistoricalChart(analystName) {
    const canvas = document.getElementById('analystClosureChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Corrección crítica: Limpieza inmediata previa a la promesa asíncrona
    if (closureChartInstance) {
        closureChartInstance.destroy();
        closureChartInstance = null;
    }
    
    injectTimeframeSelectorElement();
    let timeframe = window.currentChartTimeframe || "YTD";
    
    let res = await eel.get_analyst_closure_stats(analystName, timeframe)();
    
    if (!res.success || !res.labels || res.labels.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    const totalClosed = res.closed.reduce((acc, val) => acc + val, 0);
    const avgClosed = res.closed.length > 0 ? (totalClosed / res.closed.length) : 0;
    const avgLineData = Array(res.labels.length).fill(avgClosed); 
    
    closureChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: res.labels,
            datasets: [
                { 
                    type: 'line', 
                    label: `Avg Closed (${avgClosed.toFixed(1)})`, 
                    data: avgLineData, 
                    borderColor: '#F59E0B', 
                    borderWidth: 2, 
                    borderDash: [5, 5], 
                    pointRadius: 0, 
                    fill: false,
                    tension: 0
                },
                { label: 'Taken Cases', data: res.taken, backgroundColor: '#06B6D4', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.6 },
                { label: 'Cases Closed', data: res.closed, backgroundColor: '#058146', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { font: { family: "'Segoe UI', Arial", size: 11, weight: '600' }, color: '#1E293B' } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748B', font: { weight: '600' } } },
                y: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748B' } }
            }
        }
    });
}

async function renderTeamHistoricalChart(teamName) {
    const canvas = document.getElementById('analystClosureChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    injectTimeframeSelectorElement();
    let timeframe = window.currentChartTimeframe || "YTD";
    
    const chartCard = canvas.closest('.historical-chart-card-full') || canvas.closest('.card') || canvas.parentNode;
    const sectionTitle = chartCard ? chartCard.querySelector('h3') : null;

    let res = await eel.get_team_comprehensive_analytics(teamName, timeframe)();
    if (closureChartInstance) closureChartInstance.destroy();
    
    if (!res.success || !res.labels || res.labels.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    if (currentTeamChartMode === "bar") {
        if (sectionTitle) sectionTitle.innerText = "?? Team Productivity (Taken vs Closed Cases)";
        
        const totalClosed = res.closed_series.reduce((acc, val) => acc + val, 0);
        const avgClosed = res.closed_series.length > 0 ? (totalClosed / res.closed_series.length) : 0;
        const avgLineData = Array(res.labels.length).fill(avgClosed); 
        
        closureChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: res.labels,
                datasets: [
                    { 
                        type: 'line', 
                        label: `Team Avg Closed (${avgClosed.toFixed(1)})`, 
                        data: avgLineData, 
                        borderColor: '#F59E0B', 
                        borderWidth: 2, 
                        borderDash: [5, 5], 
                        pointRadius: 0, 
                        fill: false,
                        tension: 0
                    },
                    { label: 'Taken Cases', data: res.taken_series, backgroundColor: '#06B6D4', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.6 },
                    { label: 'Cases Closed', data: res.closed_series, backgroundColor: '#058146', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { font: { family: "'Segoe UI', Arial", size: 11, weight: '600' }, color: '#1E293B' } } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748B', font: { weight: '600' } } },
                    y: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748B' } }
                }
            }
        });
    } else {
        const colorPalette = [
            'rgba(226, 85, 60, 0.45)',   
            'rgba(26, 26, 26, 0.45)',     
            'rgba(198, 139, 89, 0.45)',   
            'rgba(141, 136, 124, 0.45)',  
            'rgba(74, 74, 74, 0.45)',     
            'rgba(212, 163, 115, 0.45)'   
        ];

        const borderPalette = [
            '#E2553C', 
            '#1A1A1A', 
            '#C68B59', 
            '#8D887C', 
            '#4A4A4A', 
            '#D4A373'  
        ];
        
        let datasets = [];
        let colorIndex = 0;
        let sourceBreakdown = null;
        let yAxisLabel = "closed cases";

        if (currentTeamChartMode === "line_closed") {
            sourceBreakdown = res.analysts_breakdown;
            yAxisLabel = "closed cases";
            if (sectionTitle) sectionTitle.innerText = "?? Analyst Closed Cases Trend (Timeline)";
        } else if (currentTeamChartMode === "line_taken") {
            sourceBreakdown = res.analysts_taken_breakdown;
            yAxisLabel = "taken cases";
            if (sectionTitle) sectionTitle.innerText = "?? Analyst Taken Cases Trend (Timeline)";
        } else if (currentTeamChartMode === "line_with_jira") {
            sourceBreakdown = res.analysts_with_jira_breakdown;
            yAxisLabel = "closed with JIRA";
            if (sectionTitle) sectionTitle.innerText = "?? Analyst Closed Cases WITH JIRA Trend (Timeline)";
        } else if (currentTeamChartMode === "line_without_jira") {
            sourceBreakdown = res.analysts_without_jira_breakdown;
            yAxisLabel = "closed without JIRA";
            if (sectionTitle) sectionTitle.innerText = "? Analyst Autonomous Closed Cases (Without JIRA) Trend";
        }

        if (sourceBreakdown) {
            const sortedAnalysts = Object.entries(sourceBreakdown).sort((a, b) => {
                const totalA = a[1].reduce((sum, val) => sum + val, 0);
                const totalB = b[1].reduce((sum, val) => sum + val, 0);
                return totalB - totalA; 
            });

            for (const [analystName, dataSeries] of sortedAnalysts) {
                datasets.push({
                    label: analystName,
                    data: dataSeries,
                    fill: true, 
                    backgroundColor: colorPalette[colorIndex % colorPalette.length],
                    borderColor: borderPalette[colorIndex % borderPalette.length],
                    borderWidth: 2, 
                    tension: 0.4, 
                    pointRadius: 3, 
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#FFFFFF',
                    pointHitRadius: 30 
                });
                colorIndex++;
            }
        }

        closureChartInstance = new Chart(ctx, {
            type: 'line', 
            data: {
                labels: res.labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: function(event, elements, chart) {
                    if (elements.length > 0) {
                        const datasetIndex = elements[0].datasetIndex;
                        
                        let visibleCount = 0;
                        for (let i = 0; i < chart.data.datasets.length; i++) {
                            if (chart.isDatasetVisible(i)) visibleCount++;
                        }
                        
                        const isOnlyThisVisible = chart.isDatasetVisible(datasetIndex) && visibleCount === 1;

                        if (isOnlyThisVisible) {
                            for (let i = 0; i < chart.data.datasets.length; i++) {
                                chart.setDatasetVisibility(i, true);
                            }
                        } else {
                            for (let i = 0; i < chart.data.datasets.length; i++) {
                                chart.setDatasetVisibility(i, i === datasetIndex);
                            }
                        }
                        chart.update();
                    }
                },
                interaction: {
                    mode: 'nearest',
                    intersect: false, 
                },
                plugins: { 
                    legend: { 
                        position: 'right', 
                        labels: { font: { family: "'Segoe UI', Arial", size: 10, weight: '600' }, color: '#1E293B', boxWidth: 12 },
                        onClick: function(e, legendItem, legend) {
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            
                            let visibleCount = 0;
                            for (let i = 0; i < ci.data.datasets.length; i++) {
                                if (ci.isDatasetVisible(i)) visibleCount++;
                            }
                            
                            const isOnlyThisVisible = ci.isDatasetVisible(index) && visibleCount === 1;

                            if (isOnlyThisVisible) {
                                for (let i = 0; i < ci.data.datasets.length; i++) {
                                    ci.setDatasetVisibility(i, true);
                                }
                            } else {
                                for (let i = 0; i < ci.data.datasets.length; i++) {
                                    ci.setDatasetVisibility(i, i === index);
                                }
                            }
                            ci.update();
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.parsed.y} ${yAxisLabel}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748B', font: { weight: '600' } } },
                    y: { 
                        beginAtZero: true, 
                        stacked: false, 
                        grid: { color: '#E2E8F0' }, 
                        ticks: { color: '#64748B' } 
                    }
                }
            }
        });
    }
}

async function loadTeamEfficiencyStats(teamName, timeframe = "12") {
    const viewEfficiency = document.getElementById("efficiency-content-body");
    if (!viewEfficiency) return;

    eel.get_team_efficiency_stats(teamName, timeframe)().then(agingRes => {
        let p30 = parseFloat(agingRes.p_30) || 0;
        let p60 = parseFloat(agingRes.p_60) || 0;
        let p90 = parseFloat(agingRes.p_90) || 0;
        let pOver = parseFloat(agingRes.p_over) || 0;

        eel.get_team_comprehensive_analytics(teamName, timeframe)().then(res => {
            
            let teamClosedWithJira = parseInt(res.team_closed_with_jira) || 0;
            let teamClosedWithoutJira = parseInt(res.team_closed_without_jira) || 0;
            let totalTeamClosed = teamClosedWithJira + teamClosedWithoutJira;
            let teamIndependenceRate = totalTeamClosed > 0 ? ((teamClosedWithoutJira / totalTeamClosed) * 100).toFixed(0) : "100";
            
            let analystsAvgHtml = "";
            if (pipelineData[teamName]) {
                const sortedAnalysts = [...pipelineData[teamName]].sort((a, b) => a.monthly_closed_avg - b.monthly_closed_avg);
                analystsAvgHtml = sortedAnalysts.map(a => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px dashed #E2E8F0; font-size: 0.82rem; color: #475569;">
                        <span style="font-weight: 500; color: #0F172A;">${a.name}</span>
                        <span style="font-size: 0.8rem;">
                            Closed: <span style="color: #16A34A; font-weight: 600;">${a.monthly_closed_avg || 0}</span> | 
                            Taken: <span style="color: #0284C7; font-weight: 600;">${a.monthly_taken_avg || 0}</span> /mo
                        </span>
                    </div>
                `).join('');
            }

            viewEfficiency.innerHTML = `
                <h2 style="color: #1E293B; font-size: 1.35rem; font-weight: 600; margin-bottom: 4px;">Team Operational Efficiency</h2>
                <p style="color: #64748B; font-size: 0.88rem; margin-bottom: 24px;">Pooled group turnaround matrices mapped comprehensively for all team accounts</p>
                
                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; margin-bottom: 24px; display: flex; flex-direction: column;">
                    <h3 style="text-align: center; color: #475569; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px;">Team Closure Aging Distribution Profile</h3>
                    
                    <div style="display: flex; width: 100%; height: 32px; background: #F1F5F9; border-radius: 6px; overflow: hidden; margin-bottom: 16px; border: 1px solid #E2E8F0;">
                        <div style="width: ${p30}%; background: #D1FAE5; display: flex; align-items: center; justify-content: center; color: #065F46; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="Within 30 Days: ${agingRes.p_30}%">${p30 >= 6 ? `${agingRes.p_30}%` : ''}</div>
                        <div style="width: ${p60}%; background: #CCFBF1; display: flex; align-items: center; justify-content: center; color: #075E54; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="31 to 60 Days: ${agingRes.p_60}%">${p60 >= 6 ? `${agingRes.p_60}%` : ''}</div>
                        <div style="width: ${p90}%; background: #FEF3C7; display: flex; align-items: center; justify-content: center; color: #92400E; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="61 to 90 Days: ${agingRes.p_90}%">${p90 >= 6 ? `${agingRes.p_90}%` : ''}</div>
                        <div style="width: ${pOver}%; background: #FEE2E2; display: flex; align-items: center; justify-content: center; color: #991B1B; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="Over 90 Days: ${agingRes.p_over}%">${pOver >= 6 ? `${agingRes.p_over}%` : ''}</div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; width: 100%;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                            <div style="width: 12px; height: 12px; background: #D1FAE5; border-radius: 2px; border: 1px solid #065F46;"></div>
                            <span style="color: #64748B;">Within 30 Days:</span>
                            <span style="color: #1E293B; font-weight: 500; margin-left: auto;">${agingRes.c_30} cases (${agingRes.p_30}%)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                            <div style="width: 12px; height: 12px; background: #CCFBF1; border-radius: 2px; border: 1px solid #075E54;"></div>
                            <span style="color: #64748B;">31 to 60 Days:</span>
                            <span style="color: #1E293B; font-weight: 500; margin-left: auto;">${agingRes.c_60} cases (${agingRes.p_60}%)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                            <div style="width: 12px; height: 12px; background: #FEF3C7; border-radius: 2px;"></div>
                            <span style="color: #64748B;">61 to 90 Days:</span>
                            <span style="color: #1E293B; font-weight: 600; margin-left: auto;">${agingRes.c_90} cases (${agingRes.p_90}%)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                            <div style="width: 12px; height: 12px; background: #FEE2E2; border-radius: 2px;"></div>
                            <span style="color: #64748B;">Over 90 Days:</span>
                            <span style="color: #1E293B; font-weight: 600; margin-left: auto;">${agingRes.c_over} cases (${agingRes.p_over}%)</span>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; width: 100%;">
                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #2563EB; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Team Average Closure Time</span>
                        <span style="color: #2563EB; font-size: 1.6rem; font-weight: 600;">${res.avg_closure_time} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">days</span></span>
                        <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Pooled team average turnaround period for finalizing workflows.</span>
                    </div>
                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #DC2626; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Team Critical Backlog Ratio</span>
                        <span style="color: #DC2626; font-size: 1.6rem; font-weight: 600;">${res.critical_backlog_ratio}%</span>
                        <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Caseload proportion across the entire cell carrying aging penalties.</span>
                    </div>
                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #16A34A; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Team Monthly Closure Average</span>
                        <span style="color: #16A34A; font-size: 1.6rem; font-weight: 600;">${res.monthly_closure_avg} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">cases</span></span>
                        <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Average monthly output productivity threshold generated across the team.</span>
                    </div>
                    
                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #0284C7; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Team Monthly Taken Average</span>
                        <span style="color: #0284C7; font-size: 1.6rem; font-weight: 600;">${res.monthly_taken_avg || 0} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">cases</span></span>
                        <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Average monthly incoming volume of cases assigned/taken across the team.</span>
                    </div>

                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #9333EA; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Team Top Month of Closures</span>
                        <span style="color: #9333EA; font-size: 1.15rem; font-weight: 600; margin-top: 4px; line-height: 1.2;">${res.top_month_closed}</span>
                        <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Peak performance month matching the highest density of team output.</span>
                    </div>
                    
                    <div id="kpi-card-team-disapproved-jiras" class="card-kpi-interactive" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #DC2626; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: all 0.2s ease;" title="Click to view full Jira breakdown for all team analysts">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Team Disapproved Jiras Profile</span>
                        <span style="color: #DC2626; font-size: 1.6rem; font-weight: 600;">${res.team_disapproved_count} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">tickets</span></span>
                        
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; border-top: 1px dashed #E2E8F0; padding-top: 8px; width: 100%; font-size: 0.8rem;">
                            ${(() => {
                                if (res.team_disapproved_count > 0 && res.team_disapproved_breakdown && Object.keys(res.team_disapproved_breakdown).length > 0) {
                                    return Object.entries(res.team_disapproved_breakdown).map(([reason, count]) => `
                                        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                                            <span style="color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;" title="${reason}">${reason}</span>
                                            <span style="color: #991B1B; font-weight: 600;">${count} tkts</span>
                                        </div>
                                    `).join('');
                                } else {
                                    return `<div style="color: #15803D; font-weight: 600; font-size: 0.8rem; text-align: center; margin-top: 8px;">Perfect record! No disapproved Jiras. 🎉</div>`;
                                }
                            })()}
                        </div>
                    </div>

                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #4B5563; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 8px;">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total Team Cases Closed</span>
                        <span style="color: #4B5563; font-size: 1.6rem; font-weight: 600;">${totalTeamClosed} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">cases</span></span>
                        
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; border-top: 1px dashed #E2E8F0; padding-top: 8px; font-size: 0.8rem;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #64748B;">Without JIRA (Auto)</span>
                                <span style="color: #991B1B; font-weight: 600;">${teamClosedWithoutJira} cases</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #64748B;">With JIRA</span>
                                <span style="color: #15803D; font-weight: 500;">${teamClosedWithJira} cases</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 6px; border-top: 1px dashed #E2E8F0; padding-top: 6px;">
                                <span style="color: #475569; font-weight: 500;">Team Independence</span>
                                <span style="color: #D97706; font-weight: 700;">${teamIndependenceRate}%</span>
                            </div>
                        </div>
                    </div>

                    <div id="card-analysts-breakdown" class="card-kpi-interactive" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: all 0.2s ease;" title="Click to view trend chart">
                        <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Analysts Breakdown (Avg)</span>
                        <div style="max-height: 150px; overflow-y: auto; width: 100%; border: 1px solid #F1F5F9; border-radius: 6px; padding-right: 4px;">
                            ${analystsAvgHtml || '<div style="color: #94A3B8; font-size:0.8rem; padding:8px; text-align:center;">No records</div>'}
                        </div>
                        <span style="color: #94A3B8; font-size: 0.8rem; line-height: 1.35; margin-top: auto;">Individual monthly historical resolution output.</span>
                    </div>

                </div>
            `;

            const breakdownCard = document.getElementById("card-analysts-breakdown");
            if (breakdownCard) {
                breakdownCard.onclick = () => {
                    currentTeamChartMode = "line_closed";
                    const chartTab = document.getElementById("audit-tab-chart");
                    if (chartTab) chartTab.click();
                };
            }

            // 🟢 Redirección limpia al hacer clic en la tarjeta de Jira
            const teamJiraCard = document.getElementById("kpi-card-team-disapproved-jiras");
            if (teamJiraCard) {
                teamJiraCard.onclick = () => {
                    const jiraTab = document.getElementById("audit-tab-jiras");
                    if (jiraTab) {
                        jiraHealthSubTab = "analysts"; // Activa el nuevo sub-tab directamente
                        jiraTab.click();
                    }
                };
            }
        });
    });
}

async function loadEfficiencyStats(analystName, timeframe = "12") {
    const viewEfficiency = document.getElementById("efficiency-content-body");
    if (!viewEfficiency) return;

    viewEfficiency.innerHTML = `
        <div style="display: flex; flex-direction: column; width: 100%; gap: 20px;">
            <div class="skeletal-block" style="height: 24px; width: 280px; border-radius: 4px;"></div>
            <div class="skeletal-block" style="height: 16px; width: 440px; border-radius: 4px; margin-bottom: 20px;"></div>
            <div class="skeletal-block" style="height: 120px; border-radius: 12px; width: 100%; margin-bottom: 24px;"></div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; width: 100%;">
                <div class="skeletal-block" style="height: 150px; border-radius: 12px;"></div>
                <div class="skeletal-block" style="height: 150px; border-radius: 12px;"></div>
                <div class="skeletal-block" style="height: 150px; border-radius: 12px;"></div>
                <div class="skeletal-block" style="height: 150px; border-radius: 12px;"></div>
            </div>
        </div>
    `;
    
    let res = await eel.get_analyst_efficiency_stats(analystName, timeframe)();
    if (!res.success) {
        viewEfficiency.innerHTML = `<div style="color: var(--color-red); font-weight:600;">Pipeline Error: ${res.error}</div>`;
        return;
    }

    let closedWithJira = parseInt(res.closed_with_jira) || 0;
    let closedWithoutJira = parseInt(res.closed_without_jira) || 0;
    let totalClosed = closedWithJira + closedWithoutJira;
    let independenceRate = totalClosed > 0 ? ((closedWithoutJira / totalClosed) * 100).toFixed(0) : "100";

    let p30_val = parseFloat(res.p_30) || 0;
    let p60_val = parseFloat(res.p_60) || 0;
    let p90_val = parseFloat(res.p_90) || 0;
    let pOver_val = parseFloat(res.p_over) || 0;

    viewEfficiency.innerHTML = `
        <h2 style="color: #1E293B; font-size: 1.35rem; font-weight: 600; margin-bottom: 4px;">Historical Operational Efficiency</h2>
        <p style="color: #64748B; font-size: 0.88rem; margin-bottom: 24px;">Advanced turnaround metrics extracted seamlessly from Salesforce Closed logs</p>
        
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; margin-bottom: 24px; display: flex; flex-direction: column;">
            <h3 style="text-align: center; color: #475569; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px;">Closure Aging Distribution Profile</h3>
            
            <div style="display: flex; width: 100%; height: 32px; background: #F1F5F9; border-radius: 6px; overflow: hidden; margin-bottom: 16px; border: 1px solid #E2E8F0;">
                <div style="width: ${p30_val}%; background: #D1FAE5; display: flex; align-items: center; justify-content: center; color: #065F46; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="Within 30 Days: ${res.p_30}%">${res.p_30}%</div>
                <div style="width: ${p60_val}%; background: #CCFBF1; display: flex; align-items: center; justify-content: center; color: #075E54; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="31 to 60 Days: ${res.p_60}%">${res.p_60}%</div>
                <div style="width: ${p90_val}%; background: #FEF3C7; display: flex; align-items: center; justify-content: center; color: #92400E; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="61 to 90 Days: ${res.p_90}%">${res.p_90}%</div>
                <div style="width: ${pOver_val}%; background: #FEE2E2; display: flex; align-items: center; justify-content: center; color: #991B1B; font-size: 0.78rem; font-weight: 600; transition: width 0.4s ease;" title="Over 90 Days: ${res.p_over}%">${res.p_over}%</div>
            </div>

           <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; width: 100%;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                    <div style="width: 12px; height: 12px; background: #D1FAE5; border-radius: 2px; flex-shrink: 0; border: 1px solid #065F46;"></div>
                    <span style="color: #64748B;">Within 30 Days:</span>
                    <span style="color: #1E293B; font-weight: 600; margin-left: auto;">${res.c_30} cases (${res.p_30}%)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                    <div style="width: 12px; height: 12px; background: #CCFBF1; border-radius: 2px; flex-shrink: 0; border: 1px solid #075E54;"></div>
                    <span style="color: #64748B;">31 to 60 Days:</span>
                    <span style="color: #1E293B; font-weight: 600; margin-left: auto;">${res.c_60} cases (${res.p_60}%)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                    <div style="width: 12px; height: 12px; background: #FEF3C7; border-radius: 2px; flex-shrink: 0; border: 1px solid #92400E;"></div>
                    <span style="color: #64748B;">61 to 90 Days:</span>
                    <span style="color: #1E293B; font-weight: 600; margin-left: auto;">${res.c_90} cases (${res.p_90}%)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
                    <div style="width: 12px; height: 12px; background: #FEE2E2; border-radius: 2px; flex-shrink: 0; border: 1px solid #991B1B;"></div>
                    <span style="color: #64748B;">Over 90 Days:</span>
                    <span style="color: #1E293B; font-weight: 600; margin-left: auto;">${res.c_over} cases (${res.p_over}%)</span>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; width: 100%;">
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #2563EB; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Average Closure Time</span>
                <span style="color: #2563EB; font-size: 1.6rem; font-weight: 600;">${res.avg_closure_time} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">days</span></span>
                <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Net average time taken by the analyst to resolve workflows.</span>
            </div>
            
            <div id="kpi-card-critical-backlog" class="card-kpi-interactive" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #DC2626; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; transition: all 0.2s ease;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Critical Backlog Ratio</span>
                <span style="color: #DC2626; font-size: 1.6rem; font-weight: 600;">${res.critical_backlog_ratio}%</span>
                <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">Percentage of active queue holding warning penalties. Click to inspect.</span>
            </div>

            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #16A34A; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Monthly Closure Average</span>
                <span style="color: #16A34A; font-size: 1.6rem; font-weight: 600;">${res.monthly_closure_avg} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">cases</span></span>
                <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">The baseline average closure metric calculated month-over-month.</span>
            </div>

            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #0284C7; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Monthly Taken Average</span>
                <span style="color: #0284C7; font-size: 1.6rem; font-weight: 600;">${res.monthly_taken_avg || 0} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">cases</span></span>
                <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">The average volume of cases assigned/taken on a monthly basis.</span>
            </div>
            
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #9333EA; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 6px;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Top Month of Closed Cases</span>
                <span style="color: #9333EA; font-size: 1.25rem; font-weight: 600; margin-top: 4px; line-height: 1.2;">${res.top_month_closed}</span>
                <span style="color: #64748B; font-size: 0.78rem; line-height: 1.35; margin-top: auto;">The peak calendar period achieving the absolute highest density of closures.</span>
            </div>
            
            <!-- 🟢 NUEVO: Carta Desglose de Desaprobados -->
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #DC2626; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 8px;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Disapproved Jiras Profile</span>
                <span style="color: #DC2626; font-size: 1.6rem; font-weight: 600;">${res.disapproved_count} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">tickets</span></span>
                
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; border-top: 1px dashed #E2E8F0; padding-top: 8px; width: 100%; font-size: 0.8rem;">
                    ${(() => {
                        if (res.disapproved_count > 0 && res.disapproved_breakdown && Object.keys(res.disapproved_breakdown).length > 0) {
                            return Object.entries(res.disapproved_breakdown).map(([reason, count]) => `
                                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                                    <span style="color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;" title="${reason}">${reason}</span>
                                    <span style="color: #991B1B; font-weight: 600;">${count} tkts</span>
                                </div>
                            `).join('');
                        } else {
                            return `<div style="color: #15803D; font-weight: 600; font-size: 0.8rem; text-align: center; margin-top: 8px;">Perfect record! No disapproved Jiras. 🎉</div>`;
                        }
                    })()}
                </div>
            </div>

            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 4px solid #4B5563; border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 8px;">
                <span style="color: #64748B; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total Cases Closed</span>
                <span style="color: #4B5563; font-size: 1.6rem; font-weight: 600;">${totalClosed} <span style="font-size: 0.9rem; font-weight: 400; color: #64748B;">cases</span></span>
                
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; border-top: 1px dashed #E2E8F0; padding-top: 8px; width: 100%; font-size: 0.8rem;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748B;">Without JIRA (Auto)</span>
                        <span style="color: #991B1B; font-weight: 600;">${closedWithoutJira} cases</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                        <span style="color: #64748B;">With JIRA</span>
                        <span style="color: #15803D; font-weight: 600;">${closedWithJira} cases</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 6px; border-top: 1px dashed #E2E8F0; padding-top: 6px;">
                        <span style="color: #475569; font-weight: 500;">Queue Independence</span>
                        <span style="color: #D97706; font-weight: 700;">${independenceRate}%</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const criticalCard = document.getElementById("kpi-card-critical-backlog");
    if (criticalCard) {
        criticalCard.onclick = () => {
            const casesTab = document.getElementById("audit-tab-cases");
            if (casesTab) {
                casesTab.click(); 
                showToast("Redirected to active backlog matrix.", "success");
            }
        };
    }
}

async function triggerReportGeneration(team, analyst) {
    const targetName = analyst ? analyst : `Cell: ${team}`;
    showToast(`Generating file for ${targetName}... Please wait.`, "success");
    let result = await eel.generate_report_action(team, analyst)();
    if (result.success) {
        showToast(result.message, "success");
    } else {
        showToast(`Pipeline Aborted: ${result.error}`, "error");
    }
}

function showToast(message, type = "success") {
    const toast = document.getElementById("toast-notification");
    toast.className = `toast show ${type}`;
    toast.innerText = message;
    setTimeout(() => { toast.classList.remove("show"); }, 4000);
}

function resetCompareLab() {
    currentCompareLevel = 1;
    compareContext = "";
    selectedContenders = [];
    currentCompareTab = "active_backlog"; 
	
	const globalTimeframeCont = document.getElementById("global-timeframe-container");
    if (globalTimeframeCont) globalTimeframeCont.style.display = "none";
    
    const compareView = document.getElementById("view-compare-lab");
    if (compareView) {
        compareView.classList.remove("active");
        compareView.classList.add("inactive");
        compareView.style.display = "none";
    }

    const gridView = document.getElementById("view-grid-mode");
    if (gridView) {
        gridView.classList.remove("inactive");
        gridView.style.display = "block";
    }

    const auditView = document.getElementById("view-audit-mode");
    if (auditView) {
        auditView.classList.remove("active");
        auditView.style.display = "none";
    }

    const labHeader = document.getElementById("btn-open-compare-lab");
    if (labHeader) {
        labHeader.classList.remove("active");
    }

    document.getElementById("btn-compare-back").style.display = "none";
    document.getElementById("compare-lab-title").innerText = "LABORATORY";
    document.getElementById("compare-lab-subtitle").innerText = "Select a category to start the comparative analysis.";
    
    document.getElementById("compare-level-1").style.display = "grid";
    document.getElementById("compare-level-2").style.display = "none";
    document.getElementById("compare-level-3").style.display = "none";

    if (currentMenuContext === "customers") {
        loadCustomersOverview();
    } else {
        loadProductsOverview();
    }
}

async function executeCompareAnalysis() {
    compareContextLevel = currentCompareLevel;
    currentCompareLevel = 3;
    
    document.getElementById("compare-level-1").style.display = "none";
    document.getElementById("compare-level-2").style.display = "none";
    
    const viewLevel3 = document.getElementById("compare-level-3");
    if (viewLevel3) {
        viewLevel3.style.setProperty('display', 'flex', 'important');
        viewLevel3.style.setProperty('flex-direction', 'column', 'important');
        viewLevel3.style.setProperty('overflow-y', 'auto', 'important');
        viewLevel3.style.setProperty('height', 'calc(100% - 90px)', 'important');
    }
    
    document.getElementById("compare-lab-title").innerText = "Laboratory: Analysis Results";
    document.getElementById("compare-lab-subtitle").innerText = `Comparing ${selectedContenders.length} active selections side by side.`;

    // 🟢 Restablecer visualmente la barra de temporalidad al valor por defecto "YTD"
    currentCompareTimeframe = "YTD";
    document.querySelectorAll(".segmented-item-comp").forEach(btn => {
        btn.classList.remove("active");
        btn.style.background = "transparent";
        btn.style.color = "#64748B";
        btn.style.fontWeight = "600";
    });
    const ytdBtn = document.querySelector(".btn-comp-YTD");
    if (ytdBtn) {
        ytdBtn.classList.add("active");
        ytdBtn.style.background = "#FFFFFF";
        ytdBtn.style.color = "#1E293B";
        ytdBtn.style.fontWeight = "700";
    }

    try {
        renderCompareKPIMatrix();
    } catch (matrixError) {
        console.error("KPI Matrix Render Error:", matrixError);
    }
    
    setTimeout(async () => {
        try {
            await renderCompareTrendChart();
        } catch (chartError) {
            console.error("Trend Chart Render Error:", chartError);
        }
    }, 100);
}

function openCompareLevel2(category) {
    currentCompareLevel = 2;
    compareContext = category;
    selectedContenders = [];
    
    const btnBack = document.getElementById("btn-compare-back");
    if (btnBack) {
        btnBack.style.display = "inline-flex";
        btnBack.innerText = "Back to Laboratory"; 
        btnBack.onclick = navigateCompareBack;
    }
    
    document.getElementById("compare-level-1").style.display = "none";
    document.getElementById("compare-level-2").style.display = "flex";
    document.getElementById("compare-level-3").style.display = "none";
    
    const grid = document.getElementById("compare-selection-grid");
    grid.innerHTML = ""; 
    
    updateCompareStatus();

    if (category === 'products') {
        document.getElementById("compare-lab-title").innerText = "Selection: Product Cells";
        document.getElementById("compare-lab-subtitle").innerText = "Click a cell to view its analysts, or use 'Select Cell' to compare whole products.";
        
        Object.keys(pipelineData).forEach(team => {
            const card = document.createElement("div");
            card.className = "card";
            card.style.cssText = "cursor: pointer; transition: all 0.2s ease; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border: 2px solid transparent;";
            
            if (selectedContenders.includes(team)) {
                card.style.border = "2px solid #3B82F6";
                card.style.background = "#F8FAFC";
            }

            const totalCases = pipelineData[team].reduce((acc, curr) => acc + curr.cases, 0);
            const headcount = pipelineData[team].length;

            card.innerHTML = `
                <div class="card-top" style="pointer-events: none; width: 100%;">
                    <h3 style="font-size: 1.15rem; font-weight: 700; color: #1E293B; margin-bottom: 6px;">${team}</h3>
                    <div style="color: #64748B; font-size: 0.85rem;">Headcount: <strong>${headcount} Analysts</strong></div>
                    <div style="color: #64748B; font-size: 0.85rem; margin-top: 4px;">Total Backlog: <strong>${totalCases} cases</strong></div>
                </div>
                <div style="margin-top: 16px; width: 100%;">
                    <button class="btn btn-secondary btn-sm select-cell-action-btn" style="width: 100%; justify-content: center; font-size: 0.78rem; font-weight: 700;">Select Cell</button>
                </div>
            `;
            
            card.onclick = (e) => {
                if (e.target.classList.contains('select-cell-action-btn')) {
                    const index = selectedContenders.indexOf(team);
                    if (index > -1) {
                        selectedContenders.splice(index, 1);
                        card.style.border = "2px solid transparent";
                        card.style.background = "#FFFFFF";
                    } else {
                        selectedContenders.push(team);
                        card.style.border = "2px solid #3B82F6";
                        card.style.background = "#F8FAFC";
                    }
                    updateCompareStatus();
                } else {
                    openProductAnalystsSelection(team);
                }
            };
            
            grid.appendChild(card);
        });
    } else {
        document.getElementById("compare-lab-title").innerText = "Selection: Customers & Airlines";
        document.getElementById("compare-lab-subtitle").innerText = "Select multiple airlines to face them off.";
        
        airlineList.forEach(airline => {
            const matchData = airlinesData[airline.name] || { avg_score: 10.0 };
            const card = createSelectionCard(airline.name, `Airline Code: ${airline.code}`, matchData.avg_score);
            grid.appendChild(card);
        });
    }
}

function openProductAnalystsSelection(teamName) {
    currentCompareLevel = 2.5; 
    document.getElementById("compare-level-2").style.display = "flex";
    
    const btnBack = document.getElementById("btn-compare-back");
    if (btnBack) {
        btnBack.innerText = "Back to Grid"; 
        btnBack.onclick = navigateCompareBack;
    }

    document.getElementById("compare-lab-title").innerText = `${teamName} Analysts`;
    document.getElementById("compare-lab-subtitle").innerText = "Select the analysts you want to include in the comparison.";
    
    const grid = document.getElementById("compare-selection-grid");
    grid.innerHTML = ""; 
    
    pipelineData[teamName].forEach(analyst => {
        const card = createSelectionCard(analyst.name, `Cell: ${teamName}`, analyst.avg);
        grid.appendChild(card);
    });
}

function createSelectionCard(title, subtitle, score) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.cssText = "cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent;";
    
    const isSelected = selectedContenders.includes(title);
    if (isSelected) {
        card.style.border = "2px solid #3B82F6";
        card.style.background = "#F8FAFC";
    }

    let scoreColor = "GREEN";
    if (score < 3.0) scoreColor = "RED";
    else if (score < 5.0) scoreColor = "ORANGE";
    else if (score < 7.0) scoreColor = "YELLOW";
    else if (score < 9.0) scoreColor = "LIGHT_GREEN";

    card.innerHTML = `
        <div class="card-top" style="pointer-events: none;">
            <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</h3>
            <div style="color: #64748B; font-size: 0.82rem; margin-bottom: 12px;">${subtitle}</div>
            <div><span class="score-pill-inline score-${scoreColor}">Score: ${score}</span></div>
        </div>
    `;

    card.onclick = () => {
        const index = selectedContenders.indexOf(title);
        if (index > -1) {
            selectedContenders.splice(index, 1);
            card.style.border = "2px solid transparent";
            card.style.background = "#FFFFFF";
        } else {
            selectedContenders.push(title);
            card.style.border = "2px solid #3B82F6";
            card.style.background = "#F8FAFC";
        }
        updateCompareStatus();
    };

    return card;
}

function updateCompareStatus() {
    const statusText = document.getElementById("compare-selection-status");
    const btnExecute = document.getElementById("btn-execute-compare");
    
    statusText.innerText = `${selectedContenders.length} selected (Choose at least 1 to compare)`;
    
    if (selectedContenders.length >= 1) {
        btnExecute.disabled = false;
        btnExecute.style.opacity = "1";
    } else {
        btnExecute.disabled = true;
        btnExecute.style.opacity = "0.5";
    }
}

function navigateCompareBack() {
    if (currentCompareLevel === 2.5) {
        openCompareLevel2('products'); 
        
        const btnBack = document.getElementById("btn-compare-back");
        if (btnBack) {
            btnBack.innerText = "Back to Laboratory";
        }
    } 
    else if (currentCompareLevel === 2) {
        currentCompareLevel = 1;
        compareContext = "";
        selectedContenders = [];
        
        const btnBack = document.getElementById("btn-compare-back");
        if (btnBack) btnBack.style.display = "none";
        
        document.getElementById("compare-lab-title").innerText = "LABORATORY";
        document.getElementById("compare-lab-subtitle").innerText = "Select a category to start the comparative analysis.";
        
        document.getElementById("compare-level-1").style.display = "grid";
        document.getElementById("compare-level-2").style.display = "none";
        document.getElementById("compare-level-3").style.display = "none";
        
        updateCompareStatus();
    } 
    else if (currentCompareLevel === 3) {
        document.getElementById("compare-level-3").style.display = "none";
        
        const level2Container = document.getElementById("compare-level-2");
        if (level2Container) {
            level2Container.style.display = "flex";
        }
        
        const btnBack = document.getElementById("btn-compare-back");
        if (btnBack) {
            if (compareContextLevel === 2.5) {
                btnBack.innerText = "Back to Grid";
            } else {
                btnBack.innerText = "Back to Laboratory";
            }
        }
        
        if (compareContextLevel === 2.5) {
            let activeTeam = "";
            const firstContender = selectedContenders[0];
            
            if (firstContender) {
                Object.keys(pipelineData).forEach(team => {
                    const found = pipelineData[team].find(a => a.name === firstContender);
                    if (found) activeTeam = team;
                });
            }
            
            if (activeTeam !== "") {
                currentCompareLevel = 2.5; 
                openProductAnalystsSelection(activeTeam);
            } else {
                currentCompareLevel = 2;
                openCompareLevel2('products');
            }
        } else {
            currentCompareLevel = 2; 
            openCompareLevel2(compareContext);
        }
    }
}

async function renderCompareKPIMatrix() {
    const matrixContainer = document.getElementById("compare-kpi-matrix");
    if (!matrixContainer) return; 

    // 1. En lugar de borrar todo y dejar la pantalla blanca, aplicamos una opacidad sutil
    // para indicar un estado de carga limpio sin romper el flujo o el Layout del DOM
    matrixContainer.style.opacity = "0.5"; 
    matrixContainer.style.transition = "opacity 0.18s ease";

    // 2. Mapeamos los contendientes a Promesas para ejecutarlas todas EN PARALELO simultáneamente
    const contendersPromises = selectedContenders.map(async (name) => {
        let activeCasesCount = 0;
        let criticalCount = 0;
        let labClosedWithJira = 0;
        let labClosedWithoutJira = 0;
        let disapprovedJiras = 0;
        let monthlyTakenAvg = 0;
        let qaScoreAvg = 0;

        if (compareContext === 'products') {
            if (pipelineData[name]) {
                // Modo: Celda de Producto completa (Agrupar analistas)
                activeCasesCount = pipelineData[name].reduce((acc, curr) => acc + curr.cases, 0);
                disapprovedJiras = pipelineData[name].reduce((acc, curr) => acc + (curr.disapproved_count || 0), 0);
                let qcAnalysts = pipelineData[name].filter(a => (a.qa_avg || 0) > 0);
                
                let totalQaSum = qcAnalysts.reduce((sum, a) => sum + a.qa_avg, 0);
                qaScoreAvg = qcAnalysts.length > 0 ? (totalQaSum / qcAnalysts.length).toFixed(1) : "0.0";

                pipelineData[name].forEach(a => {
                    if (a.all_cases) {
                        criticalCount += a.all_cases.filter(c => c.color === 'ORANGE' || c.color === 'RED').length;
                    }
                });

                let res = await eel.get_team_comprehensive_analytics(name, currentCompareTimeframe)();
                if (res && res.success) {
                    labClosedWithJira = parseInt(res.team_closed_with_jira) || 0;
                    labClosedWithoutJira = parseInt(res.team_closed_without_jira) || 0;
                    monthlyTakenAvg = parseFloat(res.monthly_taken_avg) || 0;
                }
            } else {
                // Modo: Analista individual dentro de Productos
                let found = null;
                Object.keys(pipelineData).forEach(team => {
                    const f = pipelineData[team].find(a => a.name === name);
                    if (f) found = f;
                });

                if (found) {
                    activeCasesCount = found.cases;
                    qaScoreAvg = (found.qa_avg || 0).toFixed(1);
                    disapprovedJiras = found.disapproved_count || 0;
                    if (found.all_cases) {
                        criticalCount = found.all_cases.filter(c => c.color === 'ORANGE' || c.color === 'RED').length;
                    }

                    let res = await eel.get_analyst_efficiency_stats(name, currentCompareTimeframe)();
                    if (res && res.success) {
                        labClosedWithJira = parseInt(res.closed_with_jira) || 0;
                        labClosedWithoutJira = parseInt(res.closed_without_jira) || 0;
                        monthlyTakenAvg = parseFloat(res.monthly_taken_avg) || 0;
                    }
                }
            }
        } else {
            // Modo: Customers / Airlines
            const matchData = airlinesData[name] || { active_cases: 0, critical_cases: 0, total_closed_historical: 0 };
            activeCasesCount = matchData.active_cases;
            criticalCount = matchData.critical_cases;
            disapprovedJiras = Math.round(matchData.active_cases * 0.1);
            qaScoreAvg = "92.4";

            let res = await eel.get_team_comprehensive_analytics(name, currentCompareTimeframe)();
            if (res && res.success) {
                labClosedWithJira = parseInt(res.team_closed_with_jira) || 0;
                labClosedWithoutJira = parseInt(res.team_closed_without_jira) || 0;
                monthlyTakenAvg = parseFloat(res.monthly_taken_avg) || 0;
            } else {
                labClosedWithJira = Math.round(matchData.total_closed_historical * 0.4); 
                labClosedWithoutJira = Math.round(matchData.total_closed_historical * 0.6);
                monthlyTakenAvg = Math.round(matchData.total_closed_historical / 12);
            }
        }

        const totalClosed = labClosedWithJira + labClosedWithoutJira;
        const independenceRate = totalClosed > 0 ? ((labClosedWithoutJira / totalClosed) * 100).toFixed(0) : "100";

        const activeBacklogStyle = currentCompareTab === "active_backlog" ? "border: 2px solid #3B82F6; background: #EFF6FF;" : "border: 1px solid #E2E8F0;";
        const criticalStyle = currentCompareTab === "critical_cases" ? "border: 2px solid #EF4444; background: #FEF2F2;" : "border: 1px solid #E2E8F0;";
        const totalClosedStyle = currentCompareTab === "total_closures" ? "border: 2px solid #10B981; background: #ECFDF5;" : "border: 1px solid #E2E8F0;";
        const jiraClosedStyle = currentCompareTab === "jira_closures" ? "border: 2px solid #8B5CF6; background: #F5F3FF;" : "border: 1px solid #E2E8F0;";
        const indClosedStyle = currentCompareTab === "independent_closures" ? "border: 2px solid #F59E0B; background: #FFFBEB;" : "border: 1px solid #E2E8F0;";
        
        const qaScoreStyle = currentCompareTab === "avg_qa_score" ? "border: 2px solid #2563EB; background: #EEF2FF;" : "border: 1px solid #E2E8F0;";
        const disJiraStyle = currentCompareTab === "disapproved_jiras" ? "border: 2px solid #DC2626; background: #FDF2F2;" : "border: 1px solid #E2E8F0;";
        const monthlyTakenStyle = currentCompareTab === "monthly_taken" ? "border: 2px solid #06B6D4; background: #ECFEFF;" : "border: 1px solid #E2E8F0;";

        // En lugar de hacer append, retornamos el string de HTML acumulado
        return `
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 14px;">
                <div>
                    <h4 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</h4>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; border-top: 1px solid #F1F5F9; padding-top: 12px;">
                    <div class="compare-tab-kpi" data-target="active_backlog" style="cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; ${activeBacklogStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Active Backlog</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #1E3A8A; margin-top: 2px;">${activeCasesCount} <span style="font-size:0.75rem; font-weight:500; color:#64748B;">pcs</span></div>
                    </div>
                    <div class="compare-tab-kpi" data-target="critical_cases" style="cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; ${criticalStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Critical Cases</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #741C1C; margin-top: 2px;">${criticalCount} <span style="font-size:0.75rem; font-weight:500; color:#64748B;">pcs</span></div>
                    </div>
                    <div class="compare-tab-kpi" data-target="total_closures" style="cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; ${totalClosedStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Total Closures</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #058146; margin-top: 2px;">${totalClosed} <span style="font-size:0.75rem; font-weight:500; color:#64748B;">pcs</span></div>
                    </div>
                    <div class="compare-tab-kpi" data-target="jira_closures" style="cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; ${jiraClosedStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Closed With JIRA</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #6D28D9; margin-top: 2px;">${labClosedWithJira} <span style="font-size:0.75rem; font-weight:500; color:#64748B;">pcs</span></div>
                    </div>
                    <div class="compare-tab-kpi" data-target="avg_qa_score" style="cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; ${qaScoreStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Average QA Score</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #2563EB; margin-top: 2px;">${qaScoreAvg}%</div>
                    </div>
                    <div class="compare-tab-kpi" data-target="disapproved_jiras" style="cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; ${disJiraStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Disapproved Jiras</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #DC2626; margin-top: 2px;">${disapprovedJiras} <span style="font-size:0.75rem; font-weight:500; color:#CBD5E1;">tkts</span></div>
                    </div>
                    <div class="compare-tab-kpi" data-target="monthly_taken" style="grid-column: span 2; cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; text-align: center; ${monthlyTakenStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Monthly Work Ingestion (Taken Avg)</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #06B6D4; margin-top: 2px;">~ ${typeof monthlyTakenAvg === 'number' ? monthlyTakenAvg.toFixed(1) : monthlyTakenAvg} <span style="font-size:0.8rem; font-weight:500; color:#64748B;">cases /mo</span></div>
                    </div>
                    <div class="compare-tab-kpi" data-target="independent_closures" style="grid-column: span 2; cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; text-align: center; ${indClosedStyle}">
                        <span style="font-size: 0.62rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">Analyst Independence Rate</span>
                        <div style="font-size: 1.2rem; font-weight: 800; color: #D97706; margin-top: 2px;">${independenceRate}% <span style="font-size:0.8rem; font-weight:500; color:#64748B;">(${labClosedWithoutJira} autonomous closures)</span></div>
                    </div>
                </div>
            </div>
        `;
    });

    // 3. Esperamos a que todas las peticiones asíncronas terminen al mismo tiempo en Python
    const htmlCardsArray = await Promise.all(contendersPromises);

    // 4. Inyectamos todo el string acumulado en un solo golpe y restablecemos la opacidad de golpe
    matrixContainer.innerHTML = htmlCardsArray.join("");
    matrixContainer.style.opacity = "1";

    // 5. Re-enlazamos los eventos click para los KPI internos
    matrixContainer.querySelectorAll(".compare-tab-kpi").forEach(tab => {
        tab.onclick = async (e) => {
            const selectedTarget = tab.getAttribute("data-target");
            if (currentCompareTab !== selectedTarget) {
                currentCompareTab = selectedTarget;
                renderCompareKPIMatrix();
                await renderCompareTrendChart();
            }
        };
    });
}

async function renderCompareTrendChart() {
    const canvas = document.getElementById('compareLabTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (compareChartInstance) compareChartInstance.destroy();

    const colorPalette = [
        'rgba(226, 85, 60, 0.45)',   
        'rgba(26, 26, 26, 0.45)',     
        'rgba(198, 139, 89, 0.45)',   
        'rgba(141, 136, 124, 0.45)',  
        'rgba(74, 74, 74, 0.45)',     
        'rgba(212, 163, 115, 0.45)'   
    ];

    const borderPalette = [
        '#E2553C', 
        '#1A1A1A', 
        '#C68B59', 
        '#8D887C', 
        '#4A4A4A', 
        '#D4A373'  
    ];
    let chartLabels = [];
    let datasets = [];

    const sectionTitle = canvas.closest('.historical-chart-card-full').querySelector('h3');
    if (sectionTitle) {
        if (currentCompareTab === "active_backlog") {
            sectionTitle.innerText = "📈 Historical Productivity Comparison (Closed Cases Timeline)";
        } else if (currentCompareTab === "critical_cases") {
            sectionTitle.innerText = "🚨 Critical Volatility Analysis Side-by-Side (Orange & Red Warnings)";
        } else if (currentCompareTab === "total_closures") {
            sectionTitle.innerText = "📊 Total Closed Workflows Frequency Output (Historical Timeline Log)";
        } else if (currentCompareTab === "jira_closures") {
            sectionTitle.innerText = "🔌 Engineering Dependency: Cases Resolved strictly WITH JIRA Links";
        } else if (currentCompareTab === "monthly_taken") {
            sectionTitle.innerText = "📥 Ingestion Velocity: Incoming Cases Assigned/Taken Timeline Tracker";
        } else if (currentCompareTab === "avg_qa_score") {
            sectionTitle.innerText = "🎯 Quality Assurance Baseline Comparison (Historical Target Average)";
        } else {
            sectionTitle.innerText = "⚠️ Compliance Deficit: Disapproved JIRA Total Volume Traces";
        }
    }

    for (let i = 0; i < selectedContenders.length; i++) {
        const name = selectedContenders[i];
        let res = null;

        if (compareContext === 'products') {
            if (pipelineData[name]) {
                // 🟢 SE REEMPLAZA EL STRING HARDCODED "YTD" POR LA VARIABLE DINÁMICA
                res = await eel.get_team_comprehensive_analytics(name, currentCompareTimeframe)(); 
            } else {
                // 🟢 SE REEMPLAZA EL STRING HARDCODED "YTD" POR LA VARIABLE DINÁMICA
                res = await eel.get_analyst_closure_stats(name, currentCompareTimeframe)(); 
            }
        } else {
            // 🟢 SE REEMPLAZA EL STRING HARDCODED "YTD" POR LA VARIABLE DINÁMICA
            res = await eel.get_team_comprehensive_analytics(name, currentCompareTimeframe)(); 
        }

        if (res && res.success && res.labels && res.labels.length > 0) {
            if (chartLabels.length === 0) chartLabels = res.labels;

            let baseSeries = (compareContext === 'products' && pipelineData[name]) ? res.closed_series : res.closed;
            if (!baseSeries || baseSeries.length === 0) baseSeries = res.closed_series || Array(chartLabels.length).fill(0);

            let dataSeries = [];

            if (currentCompareTab === "active_backlog" || currentCompareTab === "total_closures") {
                dataSeries = baseSeries;
            } 
            else if (currentCompareTab === "monthly_taken") {
                dataSeries = (compareContext === 'products' && pipelineData[name]) ? res.taken_series : res.taken;
                if (!dataSeries || dataSeries.length === 0) dataSeries = Array(chartLabels.length).fill(0);
            }
            else if (currentCompareTab === "avg_qa_score") {
                let qaValue = 0;
                if (compareContext === 'products' && pipelineData[name]) {
                    let qcAn = pipelineData[name].filter(a => (a.qa_avg || 0) > 0);
                    qaValue = qcAn.length > 0 ? (qcAn.reduce((sum, a) => sum + a.qa_avg, 0) / qcAn.length) : 0;
                } else {
                    Object.keys(pipelineData).forEach(team => { const found = pipelineData[team].find(a => a.name === name); if (found) qaValue = found.qa_avg || 0; });
                }
                dataSeries = Array(chartLabels.length).fill(Math.round(qaValue));
            }
            else if (currentCompareTab === "disapproved_jiras") {
                let disValue = 0;
                if (compareContext === 'products' && pipelineData[name]) {
                    disValue = pipelineData[name].reduce((sum, a) => sum + (a.disapproved_count || 0), 0);
                } else {
                    Object.keys(pipelineData).forEach(team => { const found = pipelineData[team].find(a => a.name === name); if (found) disValue = found.disapproved_count || 0; });
                }
                dataSeries = Array(chartLabels.length).fill(disValue);
            }
            else if (currentCompareTab === "critical_cases") {
                let mockCriticalCount = 0;
                if (compareContext === 'products' && pipelineData[name]) {
                    pipelineData[name].forEach(a => { if (a.all_cases) mockCriticalCount += a.all_cases.filter(c => c.color === 'ORANGE' || c.color === 'RED').length; });
                } else if (compareContext === 'products') {
                    Object.keys(pipelineData).forEach(team => { const found = pipelineData[team].find(a => a.name === name); if (found && found.all_cases) mockCriticalCount = found.all_cases.filter(c => c.color === 'ORANGE' || c.color === 'RED').length; });
                } else {
                    mockCriticalCount = (airlinesData[name] || { critical_cases: 0 }).critical_cases;
                }
                dataSeries = Array(chartLabels.length).fill(mockCriticalCount);
            } 
            else {
                let closedWithJira = 0;
                let closedWithoutJira = 0;

                if (compareContext === 'products' && pipelineData[name]) {
                    pipelineData[name].forEach(a => { closedWithJira += (a.closed_with_jira || 0); closedWithoutJira += (a.closed_without_jira || 0); });
                } else if (compareContext === 'products') {
                    Object.keys(pipelineData).forEach(team => { const found = pipelineData[team].find(a => a.name === name); if (found) { closedWithJira = (found.closed_with_jira || 0); closedWithoutJira = (found.closed_without_jira || 0); } });
                } else {
                    let total = (airlinesData[name] || { total_closed_historical: 0 }).total_closed_historical;
                    closedWithJira = Math.round(total * 0.4);
                    closedWithoutJira = Math.round(total * 0.6);
                }

                let totalVolume = closedWithJira + closedWithoutJira;
                let jiraPct = totalVolume > 0 ? (closedWithJira / totalVolume) : 0.4;

                if (currentCompareTab === "jira_closures") {
                    dataSeries = baseSeries.map(val => Math.round(val * jiraPct));
                } else {
                    dataSeries = baseSeries.map(val => Math.max(0, val - Math.round(val * jiraPct)));
                }
            }

            datasets.push({
                label: name,
                data: dataSeries,
                fill: true, 
                backgroundColor: colorPalette[i % colorPalette.length],
                borderColor: borderPalette[i % borderPalette.length],
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: '#FFFFFF',
                pointHitRadius: 30 
            });
        }
    }

    compareChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels.length > 0 ? chartLabels : ["No Records Detected"],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: function(event, elements, chart) {
                if (elements.length > 0) {
                    const datasetIndex = elements[0].datasetIndex;
                    
                    let visibleCount = 0;
                    for (let i = 0; i < chart.data.datasets.length; i++) {
                        if (chart.isDatasetVisible(i)) visibleCount++;
                    }
                    
                    const isOnlyThisVisible = chart.isDatasetVisible(datasetIndex) && visibleCount === 1;

                    if (isOnlyThisVisible) {
                        for (let i = 0; i < chart.data.datasets.length; i++) {
                            chart.setDatasetVisibility(i, true);
                        }
                    } else {
                        for (let i = 0; i < chart.data.datasets.length; i++) {
                            chart.setDatasetVisibility(i, i === datasetIndex);
                        }
                    }
                    chart.update();
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false 
            },
            plugins: {
                legend: { 
                    position: 'top', 
                    labels: { font: { family: "'Segoe UI', Arial", size: 11, weight: '600' }, color: '#1E293B', boxWidth: 12 },
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        
                        let visibleCount = 0;
                        for (let i = 0; i < ci.data.datasets.length; i++) {
                            if (ci.isDatasetVisible(i)) visibleCount++;
                        }
                        
                        const isOnlyThisVisible = ci.isDatasetVisible(index) && visibleCount === 1;

                        if (isOnlyThisVisible) {
                            for (let i = 0; i < ci.data.datasets.length; i++) {
                                ci.setDatasetVisibility(i, true);
                            }
                        } else {
                            for (let i = 0; i < ci.data.datasets.length; i++) {
                                ci.setDatasetVisibility(i, i === index);
                            }
                        }
                        ci.update();
                    }
                },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748B', font: { weight: '600' } } },
                y: { beginAtZero: true, stacked: false, grid: { color: '#E2E8F0' }, ticks: { color: '#64748B' } }
            }
        }
    });

    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 50);
}

function renderCasesTable(casesList) {
    const tbody = document.getElementById("audit-table-body");
    tbody.innerHTML = "";

    if (casesList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:#64748B; font-style:italic;">No cases match the selected parameters.</td></tr>`;
        return;
    }

    const isClosedMode = (typeof currentAnalystCasesMode !== 'undefined' && currentAnalystCasesMode === "closed");
    const scoreDisplay = isClosedMode ? "display: none;" : "";
    
    // 🟢 CORRECCIÓN 1: El header de la columna QC solo aparece si estamos en casos cerrados Y NO es Team Matrix
    const qcHeader = document.getElementById("th-qc-action");
    if (qcHeader) {
        qcHeader.style.display = (isClosedMode && auditContext !== "team") ? "" : "none";
    }

    casesList.forEach(c => {
        const row = document.createElement("tr");
        row.className = `row-${c.color} interactive-table-row`;
        
        let htmlStr = `
            <td class="clickable-case-num" style="font-family: monospace; font-weight: 700; text-align: center; width: 10%;">${c.number}</td>
            <td style="font-weight: 600; width: 15%; max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${c.account}</td>
            <td title="${c.subject}" style="width: 30%; max-width: 220px; overflow: hidden; text-overflow: ellipsis;">${c.subject}</td>
            <td style="width: 10%;">${c.status}</td>
            <td style="width: 10%;">${c.sub_status}</td>
            <td style="text-align: center; font-weight: 700; width: 10%;">${c.days}</td>
            <td style="text-align: center; font-weight: 800; width: 5%; ${scoreDisplay}">${c.score}</td>
            <td style="width: 10%; max-width: 120px; overflow: hidden; text-overflow: ellipsis;">${c.alert}</td>
        `;
        
        if (isClosedMode) {
            htmlStr += `
                <td style="text-align: center; font-weight: 600; color: #475569; width: 10%;">${c.closed_date || 'N/A'}</td>
            `;
            

            if (auditContext !== "team") {
                if (c.is_evaluated) {
                    htmlStr += `
                        <td style="width: 10%; text-align: center;"><span class="badge" style="background: #16A34A; color: #FFFFFF; font-weight: 700; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; text-transform: uppercase;">Evaluated</span></td>
                    `;
                } else {
                    let safeSubject = c.subject ? c.subject.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
                    htmlStr += `
                        <td class="qc-action-cell" style="width: 10%;"><button class="btn-generate-qc" onclick="event.stopPropagation(); openQcModal('${c.number}', '${c.closed_date}', '${safeSubject}')">Generate QC</button></td>
                    `;
                }
            }
        }
        
        row.innerHTML = htmlStr;

        row.onclick = () => {
            navigator.clipboard.writeText(c.number).then(() => {
                showToast(`Case Number ${c.number} copied to clipboard!`, "success");
            });
        };
        tbody.appendChild(row);
    });
}

function applyFiltersAndRender() {
    let filteredData = currentDisplayedCases ? [...currentDisplayedCases] : [];

    if (selectedCopyColors && selectedCopyColors.length > 0) {
        filteredData = filteredData.filter(c => selectedCopyColors.includes(c.color));
    }

    if (activeFilters.account !== "ALL") {
        filteredData = filteredData.filter(c => ((c.account || "").toString().trim() || "(Empty)") === activeFilters.account);
    }
    if (activeFilters.status !== "ALL") {
        filteredData = filteredData.filter(c => ((c.status || "").toString().trim() || "(Empty)") === activeFilters.status);
    }
    if (activeFilters.sub_status !== "ALL") {
        filteredData = filteredData.filter(c => ((c.sub_status || "").toString().trim() || "(Empty)") === activeFilters.sub_status);
    }
    if (activeFilters.alert !== "ALL") {
        filteredData = filteredData.filter(c => ((c.alert || "").toString().trim() || "(No Alert)") === activeFilters.alert);
    }

    if (currentSortColumn) {
        filteredData.sort((a, b) => {
            let valA = a[currentSortColumn];
            let valB = b[currentSortColumn];

            if (valA === undefined || valA === null) valA = "";
            if (valB === undefined || valB === null) valB = "";

            let numA = Number(valA);
            let numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && valA !== "" && valB !== "") {
                return currentSortDirection === 'asc' ? numA - numB : numB - numA;
            }

            let strA = String(valA).toLowerCase();
            let strB = String(valB).toLowerCase();
            if (strA < strB) return currentSortDirection === 'asc' ? -1 : 1;
            if (strA > strB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const nonDropdownKeys = ['number', 'subject', 'days', 'score', 'closed_date'];
    nonDropdownKeys.forEach(key => {
        const iconSpan = document.getElementById(`sort-icon-${key}`);
        if (iconSpan) {
            if (currentSortColumn === key) {
                iconSpan.innerText = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
                iconSpan.style.color = '#F59E0B';
            } else {
                iconSpan.innerText = '';
            }
        }
    });

    renderCasesTable(filteredData);
}

function buildHeaderFilters() {
    const table = document.querySelector("#audit-view-cases table");
    if (!table) return;
    
    const headers = table.querySelectorAll("thead th");
    if (headers.length < 8) return; 

    const filterConfigs = [
        { index: 1, key: 'account', label: 'Account Name', align: 'left' },
        { index: 3, key: 'status', label: 'Status', align: 'center' },
        { index: 4, key: 'sub_status', label: 'Sub-Status', align: 'center' },
        { index: 7, key: 'alert', label: 'Critical Alerts', align: 'right' } 
    ];

    filterConfigs.forEach(config => {
        const th = headers[config.index];
        if (!th) return;

        const uniqueValues = [...new Set((currentDisplayedCases || []).map(c => {
            let val = (c[config.key] || "").toString().trim();
            if (val === "") {
                return config.key === 'alert' ? "(No Alert)" : "(Empty)";
            }
            return val;
        }))].sort();

        th.innerHTML = "";
        th.style.setProperty('vertical-align', 'middle', 'important');
        th.style.setProperty('position', 'sticky', 'important');
        th.style.setProperty('top', '0', 'important');
        th.style.setProperty('z-index', '10');
        th.style.setProperty('overflow', 'visible', 'important');
        
        const flexBox = document.createElement("div");
        flexBox.style.cssText = "display: inline-flex; align-items: center; justify-content: center; width: 100%; color: #FFFFFF; user-select: none;";

        const titleLabel = document.createElement("span");
        let sortSymbol = (currentSortColumn === config.key) ? (currentSortDirection === 'asc' ? ' ▲' : ' ▼') : '';
        titleLabel.innerText = config.label + sortSymbol;
        titleLabel.style.cssText = `font-weight: 600; white-space: nowrap; cursor: pointer; ${currentSortColumn === config.key ? 'color: #F59E0B;' : ''}`;
        
        titleLabel.onclick = (e) => {
            e.stopPropagation();
            handleHeaderSort(config.key);
        };

        const triggerIcon = document.createElement("div");
        triggerIcon.style.cssText = "margin-left: 6px; width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s ease;";
        
        const isFiltered = activeFilters[config.key] !== "ALL";
        const strokeColor = isFiltered ? '#F59E0B' : '#94A3B8';
        triggerIcon.innerHTML = `
            <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${strokeColor}' stroke-width='3.5'>
                <path stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5' />
            </svg>
        `;

        const dropdownMenu = document.createElement("div");
        dropdownMenu.className = "futuristic-dropdown-menu";
        
        if (config.align === 'left') {
            dropdownMenu.style.cssText = "left: 0 !important; right: auto !important; transform: translateY(8px) !important;";
        } else if (config.align === 'right') {
            dropdownMenu.style.cssText = "right: 0 !important; left: auto !important; transform: translateY(8px) !important;";
        } else {
            dropdownMenu.style.cssText = "left: 50% !important; transform: translateX(-50%) translateY(8px) !important;";
        }
        
        dropdownMenu.onclick = (e) => e.stopPropagation();

        const allItem = document.createElement("div");
        allItem.className = `futuristic-dropdown-item ${activeFilters[config.key] === "ALL" ? "selected" : ""}`;
        allItem.innerText = `All (${(currentDisplayedCases || []).length})`;
        allItem.onclick = (e) => {
            e.stopPropagation();
            activeFilters[config.key] = "ALL";
            applyFiltersAndRender();
            buildHeaderFilters();
        };
        dropdownMenu.appendChild(allItem);

        uniqueValues.forEach(val => {
            const item = document.createElement("div");
            item.className = `futuristic-dropdown-item ${activeFilters[config.key] === val ? "selected" : ""}`;
            item.innerText = val;
            item.onclick = (e) => {
                e.stopPropagation();
                activeFilters[config.key] = val;
                applyFiltersAndRender();
                buildHeaderFilters();
            };
            dropdownMenu.appendChild(item);
        });

        const toggleMenu = (e) => {
            e.stopPropagation();
            const wasOpen = dropdownMenu.classList.contains("open");
            
            document.querySelectorAll(".futuristic-dropdown-menu").forEach(menu => menu.classList.remove("open"));
            document.querySelectorAll("#audit-view-cases table thead th").forEach(h => h.style.zIndex = "10");
            
            if (!wasOpen) {
                dropdownMenu.classList.add("open");
                th.style.zIndex = "100";
            }
        };

        triggerIcon.onclick = toggleMenu;

        flexBox.appendChild(titleLabel);
        flexBox.appendChild(triggerIcon);
        th.appendChild(flexBox);
        th.appendChild(dropdownMenu);
    });
}

function renderJiraHealthTable() {
    const tbody = document.getElementById("audit-jira-table-body");
    if (!tbody) return;

    const isTeamMode = (auditContext === "team");
    const colCount = isTeamMode ? 8 : 7;
    const cleanStr = (val) => (val || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

    let records = currentJiraTargetRecords;

    if (jiraActiveFilters.account !== "ALL") records = records.filter(r => cleanStr(r.account) === cleanStr(jiraActiveFilters.account));
    if (jiraActiveFilters.project !== "ALL") records = records.filter(r => cleanStr(r.project) === cleanStr(jiraActiveFilters.project));
    if (jiraActiveFilters.general_status !== "ALL") records = records.filter(r => cleanStr(r.general_status) === cleanStr(jiraActiveFilters.general_status));
    if (jiraActiveFilters.reason !== "ALL") records = records.filter(r => cleanStr(r.reason) === cleanStr(jiraActiveFilters.reason));
    if (isTeamMode && jiraActiveFilters.owner !== "ALL") records = records.filter(r => cleanStr(r.owner) === cleanStr(jiraActiveFilters.owner));

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center; padding:20px; color:#64748B; font-style:italic;">No Jira records match the current criteria parameters.</td></tr>`;
        buildJiraHeaderFilters();
        return;
    }

    tbody.innerHTML = "";
    records.forEach(r => {
        const isDisapproved = cleanStr(r.general_status) === "DISAPPROVED";
        const row = document.createElement("tr");
        row.className = isDisapproved ? "interactive-table-row row-RED" : "interactive-table-row";
        row.style.cursor = "pointer";
        
        row.innerHTML = `
            <td style="font-family:monospace; font-weight:700; text-align:center; color:${isDisapproved ? '#741C1C' : '#1E293B'}; border-bottom: 1px solid #E2E8F0; padding: 8px;">${r.jira_name || ''}</td>
            <td style="font-family:monospace; text-align:center; border-bottom: 1px solid #E2E8F0; padding: 8px;">${r.case_number || ''}</td>
            <td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; border-bottom: 1px solid #E2E8F0; padding: 8px;" title="${r.account || 'Unknown'}">${r.account || 'Unknown'}</td>
            ${isTeamMode ? `<td style="color:#1E293B; border-bottom: 1px solid #E2E8F0; padding: 8px;">${r.owner || ''}</td>` : ''}
            <td style="border-bottom: 1px solid #E2E8F0; padding: 8px;">${r.project || ''}</td>
            <td style="text-align:center; border-bottom: 1px solid #E2E8F0; padding: 8px;"><span class="badge" style="background:${isDisapproved ? '#741C1C' : '#1E293B'}; color:#FFFFFF;">${r.general_status || 'N/A'}</span></td>
            <td style="color:${isDisapproved ? '#741C1C' : '#334155'}; border-bottom: 1px solid #E2E8F0; padding: 8px;">${r.reason || 'Uncategorized'}</td>
            <td style="text-align:center; color:#475569; border-bottom: 1px solid #E2E8F0; padding: 8px;">${r.created_date || ''}</td>
        `;
        row.onclick = () => {
            if (r.jira_name) {
                navigator.clipboard.writeText(r.jira_name).then(() => showToast(`Jira Key ${r.jira_name} copied!`, "success"));
            }
        };
        tbody.appendChild(row);
    });

    buildJiraHeaderFilters();
}

function buildJiraHeaderFilters() {
    const table = document.querySelector("#audit-view-jiras table");
    if (!table) return;
    
    const headers = table.querySelectorAll("thead th");
    const isTeamMode = (auditContext === "team");

    const filterConfigs = isTeamMode ? [
        { index: 2, key: 'account', label: 'Customer', align: 'left' },
        { index: 3, key: 'owner', label: 'Analyst', align: 'left' },
        { index: 4, key: 'project', label: 'Project Component', align: 'left' },
        { index: 5, key: 'general_status', label: 'General Status', align: 'center' },
        { index: 6, key: 'reason', label: 'Dev Tracking Status', align: 'left' }
    ] : [
        { index: 2, key: 'account', label: 'Customer', align: 'left' },
        { index: 3, key: 'project', label: 'Project Component', align: 'left' },
        { index: 4, key: 'general_status', label: 'General Status', align: 'center' },
        { index: 5, key: 'reason', label: 'Dev Tracking Status', align: 'left' }
    ];

    filterConfigs.forEach(config => {
        const th = headers[config.index];
        if (!th) return;

        const sourceList = currentJiraTargetRecords;
        const uniqueValues = [...new Set(sourceList.map(r => {
            let val = (r[config.key] || "").toString().trim();
            return val === "" ? "(Empty)" : val;
        }))].sort();

        th.innerHTML = "";
        th.style.setProperty('position', 'sticky', 'important');
        th.style.setProperty('top', '0', 'important');
        th.style.setProperty('background', '#1A1A1A', 'important');
        th.style.setProperty('z-index', '20', 'important');
        th.style.setProperty('vertical-align', 'middle', 'important');
        th.style.setProperty('overflow', 'visible', 'important');
        
        const flexBox = document.createElement("div");
        flexBox.style.cssText = "display: inline-flex; align-items: center; justify-content: center; width: 100%; color: #FFFFFF; cursor: pointer; user-select: none;";

        const titleLabel = document.createElement("span");
        titleLabel.innerText = config.label;
        titleLabel.style.cssText = "font-weight: 600; white-space: nowrap;";

        const triggerIcon = document.createElement("div");
        triggerIcon.style.cssText = "margin-left: 6px; width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;";
        
        const isFiltered = jiraActiveFilters[config.key] !== "ALL";
        const strokeColor = isFiltered ? '#F59E0B' : '#94A3B8';
        triggerIcon.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${strokeColor}' stroke-width='3.5'><path stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5' /></svg>`;

        const dropdownMenu = document.createElement("div");
        dropdownMenu.className = "futuristic-dropdown-menu";
        
        if (config.align === 'left') dropdownMenu.style.cssText = "left: 0 !important; right: auto !important; transform: translateY(8px) !important;";
        else dropdownMenu.style.cssText = "left: 50% !important; transform: translateX(-50%) translateY(8px) !important;";
        
        dropdownMenu.onclick = (e) => e.stopPropagation();

        const allItem = document.createElement("div");
        allItem.className = `futuristic-dropdown-item ${jiraActiveFilters[config.key] === "ALL" ? "selected" : ""}`;
        allItem.innerText = `All (${sourceList.length})`;
        allItem.onclick = (e) => { e.stopPropagation(); jiraActiveFilters[config.key] = "ALL"; renderJiraHealthTable(); };
        dropdownMenu.appendChild(allItem);

        uniqueValues.forEach(val => {
            const item = document.createElement("div");
            item.className = `futuristic-dropdown-item ${jiraActiveFilters[config.key] === val ? "selected" : ""}`;
            item.innerText = val;
            item.onclick = (e) => { e.stopPropagation(); jiraActiveFilters[config.key] = val; renderJiraHealthTable(); };
            dropdownMenu.appendChild(item);
        });

        const toggleMenu = (e) => {
            e.stopPropagation();
            const wasOpen = dropdownMenu.classList.contains("open");
            document.querySelectorAll(".futuristic-dropdown-menu").forEach(menu => menu.classList.remove("open"));
            document.querySelectorAll("#audit-view-jiras table thead th").forEach(h => h.style.zIndex = "20");
            if (!wasOpen) { dropdownMenu.classList.add("open"); th.style.zIndex = "100"; }
        };

        flexBox.onclick = toggleMenu;
        th.onclick = toggleMenu;
        flexBox.appendChild(titleLabel);
        flexBox.appendChild(triggerIcon);
        th.appendChild(flexBox);
        th.appendChild(dropdownMenu);
    });
}

function renderJiraDevTrackingChart() {
    const canvas = document.getElementById('jiraDevTrackingChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (jiraDevChartInstance) {
        jiraDevChartInstance.destroy();
        jiraDevChartInstance = null;
    }

    const getMonthKey = (dateStr) => {
        if (!dateStr) return "Unknown";
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) {
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}`;
        }
        const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            const m = String(match[1]).padStart(2, '0');
            return `${match[3]}-${m}`;
        }
        return "Unknown";
    };

    const sourceList = currentJiraTargetRecords;
    const monthsSet = new Set();
    sourceList.forEach(r => {
        const m = getMonthKey(r.created_date);
        if (m !== "Unknown") monthsSet.add(m);
    });

    const labels = Array.from(monthsSet).sort();
    if (labels.length === 0) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

    const statusesSet = new Set();
    sourceList.forEach(r => { statusesSet.add(r.reason || "Uncategorized"); });
    const statusList = Array.from(statusesSet).sort();

    const dataMatrix = {};
    statusList.forEach(st => {
        dataMatrix[st] = {};
        labels.forEach(m => dataMatrix[st][m] = 0);
    });

    sourceList.forEach(r => {
        const m = getMonthKey(r.created_date);
        const st = r.reason || "Uncategorized";
        if (dataMatrix[st] && dataMatrix[st][m] !== undefined) dataMatrix[st][m]++;
    });

    // 🟢 NUEVO: Paletas con Fill Opacity para igualar las gráficas sólidas
    const colorPalette = [
        'rgba(226, 85, 60, 0.45)', 'rgba(37, 99, 235, 0.45)', 'rgba(22, 163, 74, 0.45)',
        'rgba(217, 119, 6, 0.45)', 'rgba(147, 51, 234, 0.45)', 'rgba(2, 132, 199, 0.45)',
        'rgba(5, 150, 105, 0.45)', 'rgba(234, 88, 12, 0.45)', 'rgba(79, 70, 229, 0.45)', 'rgba(100, 116, 139, 0.45)'
    ];

    const borderPalette = [
        '#E2553C', '#2563EB', '#16A34A', '#D97706', '#9333EA', 
        '#0284C7', '#059669', '#EA580C', '#4F46E5', '#64748B'
    ];

    const datasets = statusList.map((st, idx) => ({
        label: st,
        data: labels.map(m => dataMatrix[st][m]),
        fill: true, // 🟢 Ahora es una gráfica sólida
        backgroundColor: colorPalette[idx % colorPalette.length],
        borderColor: borderPalette[idx % borderPalette.length],
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#FFFFFF',
        pointHitRadius: 30 
    }));

    jiraDevChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // 🟢 NUEVO: Lógica que aísla la selección cuando tocas dentro de la gráfica
            onClick: function(event, elements, chart) {
                if (elements.length > 0) {
                    const datasetIndex = elements[0].datasetIndex;
                    let visibleCount = 0;
                    for (let i = 0; i < chart.data.datasets.length; i++) {
                        if (chart.isDatasetVisible(i)) visibleCount++;
                    }
                    const isOnlyThisVisible = chart.isDatasetVisible(datasetIndex) && visibleCount === 1;

                    if (isOnlyThisVisible) {
                        for (let i = 0; i < chart.data.datasets.length; i++) chart.setDatasetVisibility(i, true);
                    } else {
                        for (let i = 0; i < chart.data.datasets.length; i++) chart.setDatasetVisibility(i, i === datasetIndex);
                    }
                    chart.update();
                }
            },
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: "'Segoe UI', Arial", size: 11, weight: '600' }, color: '#1E293B', boxWidth: 12 },
                    // 🟢 NUEVO: Lógica que aísla la selección cuando tocas el menú (leyenda)
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        let visibleCount = 0;
                        for (let i = 0; i < ci.data.datasets.length; i++) {
                            if (ci.isDatasetVisible(i)) visibleCount++;
                        }
                        const isOnlyThisVisible = ci.isDatasetVisible(index) && visibleCount === 1;

                        if (isOnlyThisVisible) {
                            for (let i = 0; i < ci.data.datasets.length; i++) ci.setDatasetVisibility(i, true);
                        } else {
                            for (let i = 0; i < ci.data.datasets.length; i++) ci.setDatasetVisibility(i, i === index);
                        }
                        ci.update();
                    }
                },
                title: { display: true, text: 'Historical Monthly Jira Volume by Dev Tracking Status', font: { size: 13, weight: '700' } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748B', font: { weight: '600' } } },
                y: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748B', precision: 0 } }
            }
        }
    });

    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 50);
}

async function openGlobalJiraTriage() {
    currentCompareLevel = 4; 
    
    document.getElementById("compare-level-1").style.display = "none";
    document.getElementById("compare-level-2").style.display = "none";
    document.getElementById("compare-level-3").style.display = "none";
    
    const labJiraView = document.getElementById("compare-level-jira");
    if (labJiraView) {
        labJiraView.style.setProperty('display', 'flex', 'important');
        labJiraView.style.setProperty('flex-direction', 'column', 'important');
    }

    const btnBack = document.getElementById("btn-compare-back");
    if (btnBack) {
        btnBack.style.display = "inline-flex";
        btnBack.innerText = "Back to Laboratory";
        btnBack.onclick = () => {
            labJiraView.style.display = "none";
            document.getElementById("compare-level-1").style.display = "grid";
            btnBack.style.display = "none";
            document.getElementById("compare-lab-title").innerText = "LABORATORY";
            document.getElementById("compare-lab-subtitle").innerText = "Select a category to start the comparative analysis.";
        };
    }

    document.getElementById("compare-lab-title").innerText = "Global Jira Control Room";
    document.getElementById("compare-lab-subtitle").innerText = ""; // 🟢 Subtítulo limpio sin contadores
    
    setupJiraSegmentedControls();
    
    showToast("Streaming global enterprise Jira matrix...", "success");
    let res = await eel.get_global_jira_data()();
    if(res.success) {
        globalJiraRecords = res.records;
        applyJiraFiltersAndRender();
    } else {
        showToast(res.error, "error");
    }
}

function setupJiraSegmentedControls() {
    const btnAll = document.getElementById("btn-jira-all");
    const btnDis = document.getElementById("btn-jira-disapproved");

    if (btnAll) {
        btnAll.onclick = () => {
            currentJiraFilterMode = "ALL";
            btnAll.classList.add("active"); btnAll.style.background = "#FFFFFF"; btnAll.style.color = "#1E293B";
            if (btnDis) { btnDis.classList.remove("active"); btnDis.style.background = "transparent"; btnDis.style.color = "#64748B"; }
            applyJiraFiltersAndRender();
        };
    }

    if (btnDis) {
        btnDis.onclick = () => {
            currentJiraFilterMode = "DISAPPROVED";
            btnDis.classList.add("active"); btnDis.style.background = "#FFFFFF"; btnDis.style.color = "#1E293B";
            if (btnAll) { btnAll.classList.remove("active"); btnAll.style.background = "transparent"; btnAll.style.color = "#64748B"; }
            applyJiraFiltersAndRender();
        };
    }

    injectJiraTimeframeBar();
}

function applyJiraFiltersAndRender() {
    let dataset = globalJiraRecords || [];

    // 1. Filtrado por período temporal
    dataset = filterJiraByTimeframe(dataset, window.currentJiraTimeframe);

    // 2. Filtrado por estado
    if(currentJiraFilterMode === "DISAPPROVED") {
        dataset = dataset.filter(r => (r.general_status || "").trim().toUpperCase() === "DISAPPROVED");
    }

    // 🟢 Subtítulo completamente vacío como se solicitó
    const subTitle = document.getElementById("compare-lab-subtitle");
    if (subTitle) {
        subTitle.innerText = "";
    }

    renderJiraBacklogTable(dataset);
    renderJiraMetricsCharts(dataset);
}

function renderJiraMetricsCharts(recordsList) {
    let prodCounts = {};
    let analystCounts = {};

    recordsList.forEach(r => {
        let teamName = r.team.includes(" - ") ? r.team.split(" - ")[1] : r.team;
        prodCounts[teamName] = (prodCounts[teamName] || 0) + 1;
        analystCounts[r.owner] = (analystCounts[r.owner] || 0) + 1;
    });

    let sortedProds = Object.entries(prodCounts).sort((a,b) => b[1] - a[1]);
    let sortedAnalysts = Object.entries(analystCounts).sort((a,b) => b[1] - a[1]).slice(0, 8); 

    // 1. Chart de Productos
    const canvasProd = document.getElementById('jiraProductChart');
    if (canvasProd) {
        canvasProd.style.cursor = "pointer";
        canvasProd.title = "Click to expand all products view";
        canvasProd.onclick = () => openExpandedJiraChartModal('product', recordsList);
    }
    
    const ctxProd = canvasProd.getContext('2d');
    if (jiraProdChartInstance) jiraProdChartInstance.destroy();
    jiraProdChartInstance = new Chart(ctxProd, {
        type: 'bar',
        data: {
            labels: sortedProds.map(x => x[0]),
            datasets: [{
                label: currentJiraFilterMode === "ALL" ? 'Total Created Jiras' : 'Disapproved Jiras Count',
                data: sortedProds.map(x => x[1]),
                backgroundColor: currentJiraFilterMode === "ALL" ? '#1A1A1A' : '#741C1C', // 🟢 Cambiado a Negro elegante
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                title: { 
                    display: true, 
                    text: (currentJiraFilterMode === "ALL" ? 'Total Jiras Created' : 'Disapproved Jiras Created') + ' (Click to expand)',
                    font: { size: 12, weight: '700' } 
                }, 
                legend: { display: false } 
            }
        }
    });

    // 2. Chart de Analistas
    const canvasAnalyst = document.getElementById('jiraAnalystChart');
    if (canvasAnalyst) {
        canvasAnalyst.style.cursor = "pointer";
        canvasAnalyst.title = "Click to expand all analysts view";
        canvasAnalyst.onclick = () => openExpandedJiraChartModal('analyst', recordsList);
    }

    const ctxAnalyst = canvasAnalyst.getContext('2d');
    if (jiraAnalystChartInstance) jiraAnalystChartInstance.destroy();
    jiraAnalystChartInstance = new Chart(ctxAnalyst, {
        type: 'bar',
        data: {
            labels: sortedAnalysts.map(x => x[0]),
            datasets: [{
                label: 'Tickets Density',
                data: sortedAnalysts.map(x => x[1]),
                backgroundColor: currentJiraFilterMode === "ALL" ? '#F26419' : '#741C1C',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                title: { 
                    display: true, 
                    text: (currentJiraFilterMode === "ALL" ? 'Top 8 Analysts by Jira Volume' : 'Top 8 Analysts with Disapproved Jiras') + ' (Click to expand)', 
                    font: { size: 12, weight: '700' } 
                }, 
                legend: { display: false } 
            }
        }
    });
}

function renderJiraBacklogTable(recordsList) {
    const tbody = document.getElementById("global-jira-table-body");
    tbody.innerHTML = "";

    if(recordsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748B; font-style:italic;">No records found matching current criteria parameters.</td></tr>`;
        return;
    }

    recordsList.forEach(r => {
        const row = document.createElement("tr");
        row.className = r.general_status.trim().toUpperCase() === 'DISAPPROVED' ? "row-RED interactive-table-row" : "interactive-table-row";
        row.innerHTML = `
            <td style="font-family:monospace; font-weight:700; text-align:center;">${r.jira_name}</td>
            <td style="font-family:monospace; text-align:center;">${r.case_number}</td>
            <td style="font-size:0.84rem;">${r.project}</td>
            <td style="font-weight:600;">${r.owner}</td>
            <td style="font-weight:700;">${r.reason}</td>
            <td style="text-align:center;"><span class="badge" style="background:${r.general_status.trim().toUpperCase() === 'DISAPPROVED' ? '#741C1C' : '#1E293B'}; color:#FFFFFF;">${r.general_status || 'Approved'}</span></td>
        `;
        row.onclick = () => {
            navigator.clipboard.writeText(r.jira_name).then(() => {
                showToast(`Jira identifier ${r.jira_name} copied to clipboard!`, "success");
            });
        };
        tbody.appendChild(row);
    });
}

function injectJiraTimeframeBar() {
    const anchorBtn = document.getElementById("btn-jira-all") || document.getElementById("btn-jira-disapproved");
    if (!anchorBtn) return;
    
    const parentToolbar = anchorBtn.parentElement ? anchorBtn.parentElement.parentElement : null;
    if (!parentToolbar) return;

    let container = document.getElementById("jira-triage-timeframe-bar");
    if (!container) {
        container = document.createElement("div");
        container.id = "jira-triage-timeframe-bar";
        container.style.cssText = "display: inline-flex; align-items: center; gap: 6px; background: #F1F5F9; padding: 3px; border-radius: 8px; border: 1px solid #CBD5E1; margin-left: 12px;";
        parentToolbar.appendChild(container);
    }

    const options = [
        { id: "ALL", label: "All Time" },
        { id: "YTD", label: "YTD" },
        { id: "3", label: "3M" },
        { id: "6", label: "6M" },
        { id: "12", label: "12M" },
        { id: "24", label: "24M" }
    ];

    container.innerHTML = `<span style="font-size: 0.75rem; font-weight: 700; color: #64748B; padding-left: 6px; text-transform: uppercase;">Period:</span>`;

    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerText = opt.label;
        const isActive = (window.currentJiraTimeframe || "12") === opt.id;
        
        btn.style.cssText = isActive 
            ? "background: #FFFFFF; color: #1E293B; font-weight: 700; border: none; padding: 4px 10px; font-size: 0.78rem; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.08); transition: all 0.15s ease;"
            : "background: transparent; color: #64748B; font-weight: 600; border: none; padding: 4px 10px; font-size: 0.78rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;";

        btn.onclick = () => {
            window.currentJiraTimeframe = opt.id;
            injectJiraTimeframeBar();
            applyJiraFiltersAndRender();
        };
        container.appendChild(btn);
    });
}
	
function filterJiraByTimeframe(records, timeframe) {
    if (!timeframe || timeframe === "ALL") return records;
    const now = new Date();
    let cutoffDate = new Date();

    if (timeframe === "YTD") {
        cutoffDate = new Date(now.getFullYear(), 0, 1);
    } else {
        const months = parseInt(timeframe, 10);
        if (isNaN(months)) return records;
        cutoffDate.setMonth(now.getMonth() - months);
    }

    return records.filter(r => {
        if (!r.created_date) return false;
        let dt = new Date(r.created_date);
        if (isNaN(dt.getTime())) {
            const match = r.created_date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
                dt = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
            }
        }
        if (isNaN(dt.getTime())) return true;
        return dt >= cutoffDate;
    });
}

function renderJiraAnalystsVolumeChart() {
    const canvas = document.getElementById('jiraAnalystsVolumeChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (jiraAnalystsVolumeChartInstance) {
        jiraAnalystsVolumeChartInstance.destroy();
        jiraAnalystsVolumeChartInstance = null;
    }

    let sourceList = currentJiraTargetRecords || [];

    // 🟢 Filtrar usando la propiedad is_active directa calculada en Python
    if (jiraAnalystsFilterMode === "ACTIVE") {
        sourceList = sourceList.filter(r => r.is_active === true);
    }

    let counts = {};
    sourceList.forEach(r => {
        let ownerName = r.owner || "Unknown";
        counts[ownerName] = (counts[ownerName] || 0) + 1;
    });

    let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const chartTitle = jiraAnalystsFilterMode === "ACTIVE" 
        ? 'All Team Analysts by Currently Active Jiras' 
        : 'All Team Analysts by Total Created Jiras';

    jiraAnalystsVolumeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(x => x[0]),
            datasets: [{
                label: 'Jiras Count',
                data: sorted.map(x => x[1]),
                backgroundColor: '#1A1A1A',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: chartTitle,
                    font: { size: 13, weight: '700' }
                },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#1E293B', font: { weight: '600', size: 11 } } },
                y: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748B', precision: 0 } }
            }
        }
    });

    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 50);
}

async function displayAnalystJiraHealth(refreshData = false) {
    try {
        const viewJiras = document.getElementById("audit-view-jiras");
        if (!viewJiras) return;

        jiraActiveFilters = { account: "ALL", project: "ALL", general_status: "ALL", reason: "ALL", owner: "ALL" };

        // Carga rápida con caché
        if (!globalJiraRecords || globalJiraRecords.length === 0 || refreshData) {
            let res = await eel.get_global_jira_data()();
            if (!res || !res.success || !res.records) {
                viewJiras.innerHTML = `<div style="padding:20px; text-align:center; color:#741C1C;">${res ? res.error : "Failed to load data."}</div>`;
                return;
            }
            globalJiraRecords = res.records;
        }

        const cleanStr = (val) => (val || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
        const targetNorm = cleanStr(activeTargetName);

        const isTeamMode = (auditContext === "team");

        if (isTeamMode) {
            currentJiraTargetRecords = globalJiraRecords.filter(r => cleanStr(r.team) === targetNorm);
        } else {
            currentJiraTargetRecords = globalJiraRecords.filter(r => cleanStr(r.owner) === targetNorm);
            
            // 🟢 CORRECCIÓN: Solo resetea a 'table' si venías de la sub-pestaña de 'analysts' (que es solo de equipo).
            // Mantiene 'chart' si seleccionas Dev Tracking Analytics.
            if (jiraHealthSubTab === "analysts") {
                jiraHealthSubTab = "table";
            }
        }

        viewJiras.innerHTML = `
            <div style="display: flex; flex-direction: column; width: 100%; height: 100%; gap: 16px;">
                <!-- Sub-header Toolbar -->
                <div style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px 20px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                    <div style="display: inline-flex; background: #F1F5F9; padding: 3px; border-radius: 8px; border: 1px solid #CBD5E1; gap: 4px;">
                        <button id="btn-jira-subtab-table" type="button" style="${jiraHealthSubTab === 'table' ? 'background: #FFFFFF; color: #1E293B; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748B; font-weight: 600;'} border: none; padding: 6px 16px; font-size: 0.82rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">Jira Records (${currentJiraTargetRecords.length})</button>
                        <button id="btn-jira-subtab-chart" type="button" style="${jiraHealthSubTab === 'chart' ? 'background: #FFFFFF; color: #1E293B; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748B; font-weight: 600;'} border: none; padding: 6px 16px; font-size: 0.82rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">Dev Tracking Analytics</button>
                        ${isTeamMode ? `<button id="btn-jira-subtab-analysts" type="button" style="${jiraHealthSubTab === 'analysts' ? 'background: #FFFFFF; color: #1E293B; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748B; font-weight: 600;'} border: none; padding: 6px 16px; font-size: 0.82rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">All Analysts by Jira Volume</button>` : ''}
                    </div>
                </div>

                <!-- Sub-view 1: Tabla -->
                <div id="jira-subview-table" style="display: ${jiraHealthSubTab === 'table' ? 'flex' : 'none'}; flex-direction: column; flex: 1; width: 100%; height: 100%; overflow: hidden;">
                    <div class="excel-table-wrapper" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; flex: 1; height: 100%; overflow-y: auto; overflow-x: auto; position: relative;">
                        <table class="excel-data-table" style="width: 100%; border-collapse: separate; border-spacing: 0;">
                            <thead>
                                <tr style="background: #1A1A1A; color: #FFFFFF;">
                                    <th style="text-align:center; width: 10%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Jira Key</th>
                                    <th style="text-align:center; width: 10%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Case Number</th>
                                    <th style="width: 14%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Customer</th>
                                    ${isTeamMode ? '<th style="width: 12%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Analyst</th>' : ''}
                                    <th style="width: 16%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Project Component</th>
                                    <th style="text-align:center; width: 14%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">General Status</th>
                                    <th style="width: 14%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Dev Tracking Status</th>
                                    <th style="text-align:center; width: 10%; position: sticky; top: 0; background: #1A1A1A; z-index: 20; padding: 10px;">Created Date</th>
                                </tr>
                            </thead>
                            <tbody id="audit-jira-table-body"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Sub-view 2: Dev Tracking Chart -->
                <div id="jira-subview-chart" style="display: ${jiraHealthSubTab === 'chart' ? 'block' : 'none'}; width: 100%;">
                    <div class="historical-chart-card-full" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; min-height: 420px; position: relative;">
                        <canvas id="jiraDevTrackingChart" style="max-height: 380px;"></canvas>
                    </div>
                </div>

                <!-- Sub-view 3: All Analysts Chart (Solo renderizado en Team Mode) -->
                ${isTeamMode ? `
                <div id="jira-subview-analysts" style="display: ${jiraHealthSubTab === 'analysts' ? 'flex' : 'none'}; flex-direction: column; width: 100%; gap: 12px;">
                    <div style="display: flex; justify-content: flex-end; align-items: center;">
                        <div style="display: inline-flex; background: #F1F5F9; padding: 3px; border-radius: 8px; border: 1px solid #CBD5E1; gap: 4px;">
                            <button id="btn-jira-analysts-mode-all" type="button" style="${jiraAnalystsFilterMode === 'ALL' ? 'background: #FFFFFF; color: #1E293B; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748B; font-weight: 600;'} border: none; padding: 5px 14px; font-size: 0.78rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">All Created Jiras</button>
                            <button id="btn-jira-analysts-mode-active" type="button" style="${jiraAnalystsFilterMode === 'ACTIVE' ? 'background: #FFFFFF; color: #1E293B; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08);' : 'background: transparent; color: #64748B; font-weight: 600;'} border: none; padding: 5px 14px; font-size: 0.78rem; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">Currently Active Jiras</button>
                        </div>
                    </div>
                    <div class="historical-chart-card-full" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; min-height: 420px; position: relative;">
                        <canvas id="jiraAnalystsVolumeChart" style="max-height: 380px;"></canvas>
                    </div>
                </div>` : ''}
            </div>
        `;

        document.getElementById("btn-jira-subtab-table").onclick = () => { jiraHealthSubTab = "table"; displayAnalystJiraHealth(); };
        document.getElementById("btn-jira-subtab-chart").onclick = () => { jiraHealthSubTab = "chart"; displayAnalystJiraHealth(); renderJiraDevTrackingChart(); };
        
        if (isTeamMode) {
            const btnAnalysts = document.getElementById("btn-jira-subtab-analysts");
            if (btnAnalysts) {
                btnAnalysts.onclick = () => { jiraHealthSubTab = "analysts"; displayAnalystJiraHealth(); renderJiraAnalystsVolumeChart(); };
            }

            const btnModeAll = document.getElementById("btn-jira-analysts-mode-all");
            const btnModeActive = document.getElementById("btn-jira-analysts-mode-active");
            if (btnModeAll && btnModeActive) {
                btnModeAll.onclick = () => { jiraAnalystsFilterMode = "ALL"; displayAnalystJiraHealth(); };
                btnModeActive.onclick = () => { jiraAnalystsFilterMode = "ACTIVE"; displayAnalystJiraHealth(); };
            }
        }

        if (jiraHealthSubTab === "table") renderJiraHealthTable();
        else if (jiraHealthSubTab === "chart") renderJiraDevTrackingChart();
        else if (isTeamMode && jiraHealthSubTab === "analysts") renderJiraAnalystsVolumeChart();

    } catch (err) {
        console.error("Error displaying Jira Health:", err);
    }
}

function openExpandedJiraChartModal(type, recordsList) {
    let existingModal = document.getElementById("jira-expanded-chart-modal");
    if (existingModal) existingModal.remove();

    let counts = {};
    recordsList.forEach(r => {
        if (type === 'product') {
            let teamName = r.team.includes(" - ") ? r.team.split(" - ")[1] : r.team;
            counts[teamName] = (counts[teamName] || 0) + 1;
        } else {
            let ownerName = r.owner || "Unknown";
            counts[ownerName] = (counts[ownerName] || 0) + 1;
        }
    });

    let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const modalTitle = type === 'product' 
        ? (currentJiraFilterMode === "ALL" ? "All Product Cells by Jira Volume" : "All Product Cells by Disapproved Jiras")
        : (currentJiraFilterMode === "ALL" ? "All Analysts by Jira Volume" : "All Analysts with Disapproved Jiras");

    const dynamicMinHeight = Math.max(450, sorted.length * 28);

    const modalHtml = `
        <div id="jira-expanded-chart-modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(5px); z-index: 999999; justify-content: center; align-items: center;">
            <div style="background: #FFFFFF; width: 90vw; max-width: 1100px; max-height: 88vh; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; overflow: hidden;">
                <div style="background: #1E293B; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="color: #FFFFFF; font-size: 1.1rem; font-weight: 700; margin: 0;">${modalTitle} <span style="font-size: 0.82rem; color: #38BDF8; font-weight: 500;">(${sorted.length} Total Entries)</span></h3>
                    <button onclick="document.getElementById('jira-expanded-chart-modal').remove()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.6rem; cursor: pointer; transition: color 0.15s ease;" onmouseover="this.style.color='#FFFFFF'" onmouseout="this.style.color='#94A3B8'">&times;</button>
                </div>
                <div style="padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; background: #F8FAFC;">
                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px; width: 100%; box-sizing: border-box;">
                        <div style="position: relative; width: 100%; min-height: ${dynamicMinHeight}px;">
                            <canvas id="jiraExpandedCanvas"></canvas>
                        </div>
                    </div>
                </div>
                <div style="padding: 14px 24px; background: #FFFFFF; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end;">
                    <button class="btn btn-secondary" onclick="document.getElementById('jira-expanded-chart-modal').remove()">Close View</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 🟢 Cierre automático al hacer clic afuera de la tarjeta blanca
    const modalOverlay = document.getElementById("jira-expanded-chart-modal");
    if (modalOverlay) {
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        };
    }

    const ctx = document.getElementById('jiraExpandedCanvas').getContext('2d');
    if (jiraExpandedChartInstance) jiraExpandedChartInstance.destroy();

    // 🟢 Mantiene el color negro `#1A1A1A` para productos
    const barColor = type === 'product'
        ? (currentJiraFilterMode === "ALL" ? '#1A1A1A' : '#741C1C')
        : (currentJiraFilterMode === "ALL" ? '#F26419' : '#741C1C');

    jiraExpandedChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(x => x[0]),
            datasets: [{
                label: 'Jira Count',
                data: sorted.map(x => x[1]),
                backgroundColor: barColor,
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748B', precision: 0 } },
                y: { grid: { display: false }, ticks: { color: '#1E293B', font: { weight: '600', size: 11 } } }
            }
        }
    });
}

async function switchAnalystCasesMode(mode) {
	if (window.clearCopySelections) window.clearCopySelections();
    currentAnalystCasesMode = mode;
    const btnActive = document.getElementById("btn-analyst-cases-active");
    const btnClosed = document.getElementById("btn-analyst-cases-closed");
    const timeframeContainer = document.getElementById("analyst-closed-timeframe-container");
    
    const quickActions = document.querySelector(".table-quick-actions");
    const scoreHeader = document.getElementById("th-score");
    const closedDateHeader = document.getElementById("th-closed-date"); 
    
    if (mode === "active") {
        btnActive.classList.add("active"); btnActive.style.background = "#FFFFFF"; btnActive.style.color = "#1E293B"; btnActive.style.fontWeight = "700";
        btnClosed.classList.remove("active"); btnClosed.style.background = "transparent"; btnClosed.style.color = "#64748B"; btnClosed.style.fontWeight = "600";
        
        timeframeContainer.style.display = "none";
        
        if (quickActions) quickActions.style.display = "flex";
        if (scoreHeader) scoreHeader.style.display = "";
        if (closedDateHeader) closedDateHeader.style.display = "none"; 
        
        if (auditContext === "team") {
            displayTeamBacklog();
        } else {
            const analystObj = pipelineData[currentTeam].find(a => a.name === activeTargetName);
            currentDisplayedCases = analystObj ? analystObj.all_cases : [];
            activeFilters = { account: "ALL", status: "ALL", sub_status: "ALL", alert: "ALL" };
            buildHeaderFilters();
            applyFiltersAndRender();
        }
    } else {
        btnClosed.classList.add("active"); btnClosed.style.background = "#FFFFFF"; btnClosed.style.color = "#1E293B"; btnClosed.style.fontWeight = "700";
        btnActive.classList.remove("active"); btnActive.style.background = "transparent"; btnActive.style.color = "#64748B"; btnActive.style.fontWeight = "600";
        
        timeframeContainer.style.display = "flex";
        
        if (quickActions) quickActions.style.display = "none";
        if (scoreHeader) scoreHeader.style.display = "none";
        if (closedDateHeader) closedDateHeader.style.display = ""; 
        
        await fetchAndRenderClosedCases();
    }
}

async function changeClosedTimeframe(months) {
    currentAnalystClosedTimeframe = months;
    
    document.querySelectorAll(".segmented-item-timeframe").forEach(btn => {
        btn.classList.remove("active");
        btn.style.background = "transparent";
        btn.style.color = "#64748B";
        btn.style.fontWeight = "600";
    });
    
    const activeBtn = document.querySelector(`.btn-tf-${months}`);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.style.background = "#FFFFFF";
        activeBtn.style.color = "#1E293B";
        activeBtn.style.fontWeight = "700";
    }
    
    await fetchAndRenderClosedCases();
}

async function fetchAndRenderClosedCases() {
    showToast(`Streaming historical closed metrics for the last ${currentAnalystClosedTimeframe} months...`, "success");
    let result = await eel.get_analyst_closed_cases(activeTargetName, currentAnalystClosedTimeframe)();
    if (result.success) {
        currentDisplayedCases = result.cases;
        activeFilters = { account: "ALL", status: "ALL", sub_status: "ALL", alert: "ALL" };
        buildHeaderFilters();
        applyFiltersAndRender();
    } else {
        showToast(`Backend Pipeline Fault: ${result.error}`, "error");
    }
}

async function loadEvaluationsTab(analystName) {
    const tbody = document.getElementById("qc-history-table-body");
    const totalCols = auditContext === "team" ? 8 : 7;
    tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding:20px;">Fetching QA Historical Records...</td></tr>`;
    
    const tableHeader = document.querySelector("#audit-view-evaluations .excel-data-table thead");
    if (tableHeader) {
        if (auditContext === "team") {
            tableHeader.innerHTML = `
                <tr>
                    <th>Target Case</th>
                    <th>Analyst</th>
                    <th>Closed Month</th>
                    <th>Evaluation Date</th>
                    <th>Integrity Score</th>
                    <th>Communication Score</th>
                    <th>Final QA Result</th>
                    <th style="text-align: center; width: 100px;">Action</th>
                </tr>
            `;
        } else {
            tableHeader.innerHTML = `
                <tr>
                    <th>Target Case</th>
                    <th>Closed Month</th>
                    <th>Evaluation Date</th>
                    <th>Integrity Score</th>
                    <th>Communication Score</th>
                    <th>Final QA Result</th>
                    <th style="text-align: center; width: 100px;">Action</th>
                </tr>
            `;
        }
    }

    let res = await eel.get_qc_evaluations(analystName)();
    if (!res.success) {
        tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding:20px; color:var(--color-red);">${res.error}</td></tr>`;
        return;
    }
    
    const records = res.data;
    
    let totalPct = 0;
    records.forEach(r => { totalPct += r.percentage; });
    let avgQc = records.length > 0 ? Math.round(totalPct / records.length) : 0;
    
    document.getElementById("qc-kpi-avg").innerText = `${avgQc}%`;
    document.getElementById("qc-kpi-count").innerText = records.length;
    
    const kpiCardItem = document.getElementById("qc-kpi-avg").parentElement;
    if (records.length === 0) kpiCardItem.style.borderLeft = "6px solid var(--color-grey)";
    else if (avgQc >= 90) kpiCardItem.style.borderLeft = "6px solid var(--color-green)";
    else if (avgQc >= 75) kpiCardItem.style.borderLeft = "6px solid var(--color-yellow)";
    else kpiCardItem.style.borderLeft = "6px solid var(--color-red)";

    tbody.innerHTML = "";
    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding:20px; color:#64748B; font-style:italic;">No QC evaluations recorded.</td></tr>`;
    } else {
        records.forEach(r => {
            let scoreColor = r.percentage >= 90 ? "#16A34A" : (r.percentage >= 75 ? "#D97706" : "#DC2626");
            const row = document.createElement("tr");
            row.className = "interactive-table-row";
            row.style.cursor = "pointer";
            
            let analystCell = auditContext === "team" ? `<td style="font-weight: 600;">${r.analyst}</td>` : "";
            
            row.innerHTML = `
                <td style="font-family: monospace; font-weight: 700;">${r.case_number}</td>
                ${analystCell}
                <td>${r.case_closed_month}</td>
                <td>${r.timestamp.split(" ")[0]}</td>
                <td style="font-weight: 600; color: #475569;">${r.score_integrity} pts</td>
                <td style="font-weight: 600; color: #475569;">${r.score_comm} pts</td>
                <td style="font-weight: 800; color: ${scoreColor};">${r.percentage}%</td>
                <td style="text-align: center;"><button class="btn btn-secondary btn-sm" style="color: #DC2626; border-color: #FCA5A5; padding: 2px 8px; font-size: 0.72rem; height: 26px; font-weight:700;" onclick="event.stopPropagation(); triggerDeleteQcEvaluation('${r.case_number}')">Delete</button></td>
            `;
            
            row.onclick = () => { openQcDetailsModal(r); };
            tbody.appendChild(row);
        });
    }
    
    let labels = [];
    let datasets = [];
    let chartType = 'bar'; // Tipo por defecto para analista individual
    let chartRecords = [...records].reverse(); // Clon cronológico inverso[cite: 9]
    
    // 🎯 VALIDACIÓN DE CONTEXTO MULTI-ANALYST (TEAM MATRIX)
    if (auditContext === "team") {
        chartType = 'line'; // Cambiamos dinámicamente el motor a gráfico de líneas
        
        // Extraer rango completo de meses continuos para la línea de tiempo real de auditorías (YYYY-MM)
        let validEvalMonths = records
            .map(r => (r.timestamp) ? r.timestamp.substring(0, 7) : null)
            .filter(m => m && m.match(/^\d{4}-\d{2}$/));

        if (validEvalMonths.length === 0) {
            labels = ["No Data"];
        } else {
            validEvalMonths.sort();
            let startStr = validEvalMonths[0];
            let endStr = validEvalMonths[validEvalMonths.length - 1];
            
            let startYear = parseInt(startStr.split("-")[0]);
            let startMonth = parseInt(startStr.split("-")[1]);
            let endYear = parseInt(endStr.split("-")[0]);
            let endMonth = parseInt(endStr.split("-")[1]);
            
            let curYear = startYear;
            let curMonth = startMonth;
            
            while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
                labels.push(`${curYear}-${String(curMonth).padStart(2, '0')}`);
                curMonth++;
                if (curMonth > 12) {
                    curMonth = 1;
                    curYear++;
                }
            }
        }

        // Agrupar promedios mensuales matemáticos por analista y mes[cite: 6]
        let analystData = {};
        records.forEach(r => {
            let m = (r.timestamp) ? r.timestamp.substring(0, 7) : "Unknown";
            if (m === "Unknown" || !m.match(/^\d{4}-\d{2}$/)) return;
            
            if (!analystData[r.analyst]) analystData[r.analyst] = {};
            if (!analystData[r.analyst][m]) analystData[r.analyst][m] = { sum: 0, count: 0 };
            
            analystData[r.analyst][m].sum += r.percentage;
            analystData[r.analyst][m].count += 1;
        });
        
        const borderPalette = ['#E2553C', '#1A1A1A', '#C68B59', '#2563EB', '#16A34A', '#9333EA', '#0284C7', '#D97706'];
        let colorIdx = 0;
        
        Object.keys(analystData).forEach(analyst => {
            let dataPoints = labels.map(m => {
                if (analystData[analyst][m]) {
                    return Math.round(analystData[analyst][m].sum / analystData[analyst][m].count);
                }
                return null; // Deja huecos limpios si no hay data
            });
            
            datasets.push({
                label: analyst,
                data: dataPoints,
                borderColor: borderPalette[colorIdx % borderPalette.length],
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                spanGaps: true // Permite conectar elegantemente la tendencia entre meses saltados[cite: 6]
            });
            colorIdx++;
        });
    } else {
        // Mantenemos tu gráfica de barras por caso individual impecable[cite: 9]
        chartType = 'bar';
        labels = chartRecords.map(r => r.timestamp ? r.timestamp.split(" ")[0] : "Unknown");
        
        let dataPoints = chartRecords.map(r => r.percentage);
        let dynamicColors = chartRecords.map(r => {
            if (r.percentage >= 90) return "#2E7D32"; 
            if (r.percentage >= 75) return "#C69214"; 
            return "#8C1D1D"; 
        });
        
        datasets.push({
            label: 'Case Audit Result',
            data: dataPoints,
            backgroundColor: dynamicColors,
            borderRadius: 4,
            barPercentage: 0.4,
            categoryPercentage: 0.6
        });
    }
    
    const ctx = document.getElementById('qcMonthlyChart').getContext('2d');
    if (qcChartInstance) qcChartInstance.destroy();
    
    qcChartInstance = new Chart(ctx, {
        type: chartType, // Inyección dinámica del tipo de gráfica[cite: 6, 9]
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, max: 100, ticks: { color: '#64748B' } },
                x: { ticks: { color: '#1E293B', font: { weight: '700', size: 10 } } }
            },
            plugins: { 
                legend: { 
                    display: true, 
                    position: auditContext === "team" ? 'right' : 'top',
                    labels: { font: { weight: '600' } }
                }, 
                title: { 
                    display: true, 
                    text: auditContext === "team" ? 'Team Quality Comparative Trajectory' : 'Granular Analyst Cases Evaluation Log',
                    font: { size: 13, weight: '700' }
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            let idx = context[0].dataIndex;
                            if (auditContext === "team") {
                                return `Evaluation Period: ${labels[idx]}`;
                            } else {
                                return `Evaluation Date: ${chartRecords[idx].timestamp.split(" ")[0]}`;
                            }
                        },
                        label: function(context) {
                            let idx = context.dataIndex;
                            if (auditContext === "team") {
                                return ` ${context.dataset.label}: ${context.parsed.y}% Avg Score`;
                            } else {
                                let rec = chartRecords[idx];
                                return [
                                    ` Case Number: ${rec.case_number}`,
                                    ` Score: ${rec.percentage}%`,
                                    ` Auditor: ${rec.auditor || 'Anonymous'}`
                                ];
                            }
                        }
                    }
                }
            }
        }
    });
}

const qcSchema = {
    integrity: [
        { 
            id: "subj", 
            label: "Subject line", 
            weight: 2, 
            desc: "Format must be strictly entered as follows: CARRIER CODE - ENVIRONMENT - PRODUCT - MODULE - SUBJECT - Case ID: XXXXXX" 
        },
        { 
            id: "asset", 
            label: "Asset & System", 
            weight: 2, 
            desc: "Appropriate suite/solution where the issue is located, matching the active JIRA project for the investigating team. Affected environment must be identified (CERT, TSTS, PROD, etc.)." 
        },
        { 
            id: "substatus", 
            label: "Substatus mapped correctly", 
            weight: 2, 
            desc: "Use of the correct sub-status according to the specific technical team that resolved the issue." 
        },
        { 
            id: "research", 
            label: "Research & Documentation", 
            weight: 6, 
            desc: "Documentation of meaningful details and troubleshooting steps performed (Where did you check? What did you do? Who did you talk to? Recreation steps). Includes keeping information preserved: OTH added to PNR history, complete logs, and linking Knowledge Articles if available." 
        },
        { 
            id: "error", 
            label: "Error Response", 
            weight: 2, 
            desc: "Accurate logging of the error message received by the customer if applicable." 
        }
    ],
    communication: [
        { 
            id: "root", 
            label: "Root Cause provided", 
            weight: 3, 
            desc: "Appropriate documentation of the situation that triggered the issue. 'N/A', 'TBD', or left blank are not acceptable; explanations must be final before closing the case. (Internal field)." 
        },
        { 
            id: "resolution", 
            label: "Resolution provided", 
            weight: 5, 
            desc: "Brief summary of what was done to resolve the issue. This field is viewable by the customer; information must be clear and accurate for external consumption." 
        },
        { 
            id: "proactive", 
            label: "Proactive Communication", 
            weight: 3, 
            desc: "Adjust customers’ expectations on when they will hear back. If working with internal teams, acknowledge the case and send an update within 3 business days." 
        },
        { 
            id: "adapt", 
            label: "Adapt to technical level", 
            weight: 2, 
            desc: "Make sure we adapt our vocabulary and complexity to match the customer’s technical level when communicating with them." 
        },
        { 
            id: "backforth", 
            label: "Avoid unnecessary back & forth", 
            weight: 2, 
            desc: "Answer all questions asked by the customer at once. Provide all documentation, steps, links to User Guides, or suggest a live call when needed." 
        }
    ]
};

function openQcModal(caseNumber, closedDate, subject) {
    currentQcTargetCase = caseNumber;
    currentQcClosedMonth = closedDate;
    
    // Limpiamos cualquier popover anterior si existiera
    const existingPopover = document.getElementById("qc-info-popover");
    if (existingPopover) existingPopover.remove();
    
    document.getElementById("qc-modal-case-target").innerText = `| ${caseNumber}`;
    document.getElementById("qc-modal-overlay").style.display = "flex";
    
    const container = document.getElementById("qc-form-container");
    container.innerHTML = "";
    
    let html = `
        <div style="background: #F1F5F9; border-left: 4px solid #1E3A8A; padding: 12px 16px; border-radius: 6px; margin-bottom: 4px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);">
            <h4 style="margin: 0 0 4px 0; color: #1E3A8A; font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;">Case Reference Context</h4>
            <p id="qc-modal-subject-safeguard" style="margin: 0; font-size: 0.84rem; color: #334155; font-weight: 500; line-height: 1.4; white-space: normal; word-break: break-word;"></p>
        </div>
        
        <div style="margin-bottom: 8px; margin-top: 4px;">
            <label style="font-size: 0.8rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Auditor Name:</label>
            <input type="text" id="qc_auditor_name" placeholder="E.g. Gerardo Escudero" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.85rem; outline: none; box-sizing: border-box;">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; margin-top: 8px;">
            <div id="qc-col-integrity"></div>
            <div id="qc-col-communication"></div>
        </div>
        
        <div style="margin-top: 8px;">
            <label style="font-size: 0.8rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">General Comments / Feedback:</label>
            <textarea id="qc_comments" rows="2" placeholder="Provide detailed feedback here to justify the score and help the analyst..." style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.85rem; outline: none; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Inyectar el Popover flotante en el overlay general
    let popover = document.createElement("div");
    popover.id = "qc-info-popover";
    popover.style.cssText = "display: none; position: fixed; width: 340px; background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(10px); border-radius: 12px; box-shadow: 0 15px 35px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06); z-index: 9999999; padding: 16px; flex-direction: column; opacity: 0; transform: scale(0.95); transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);";
    document.getElementById("qc-modal-overlay").appendChild(popover);

    // Cerrar popover automáticamente si se scrollea el formulario principal
    container.onscroll = () => { window.closeQcPopover(); };
    
    const buildColumnContent = (title, items) => {
        let secHtml = `<div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
            <h3 style="margin-top: 0; margin-bottom: 4px; color: #1E293B; font-size: 0.95rem; border-bottom: 2px solid #CBD5E1; padding-bottom: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${title}</h3>`;
        
        items.forEach(item => {
            secHtml += `
                <div id="qc-row-${item.id}" style="padding: 8px; border: 1px solid #E2E8F0; background: #FFFFFF; border-radius: 6px; transition: all 0.15s ease;" class="qc-field-row">
                    <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;" onclick="showQcPopover('${item.id}', event)">
                        <span style="font-size: 0.82rem; color: #334155; font-weight: 600;">
                            ${item.label} <span style="color:#94A3B8; font-size:0.72rem; font-weight: normal;">(${item.weight} pts)</span>
                        </span>
                        
                        <div class="qc-btn-group" id="qc_group_${item.id}" data-value="yes" data-weight="${item.weight}" style="display: flex; gap: 4px; background: #F1F5F9; padding: 2px; border-radius: 6px; border: 1px solid #E2E8F0;" onclick="event.stopPropagation()">
                            <button type="button" onclick="setQcStatus('${item.id}', 'yes', event)" style="padding: 4px 12px; font-size: 0.78rem; font-weight: 700; border: 1px solid #22C55E; border-radius: 4px; cursor: pointer; transition: all 0.12s ease; background: #DCFCE7; color: #15803D; box-shadow: inset 0 2px 4px rgba(0,0,0,0.08);">Yes</button>
                            <button type="button" onclick="setQcStatus('${item.id}', 'no', event)" style="padding: 4px 12px; font-size: 0.78rem; font-weight: 700; border: 1px solid transparent; border-radius: 4px; cursor: pointer; transition: all 0.12s ease; background: transparent; color: #475569; box-shadow: none;">No</button>
                            <button type="button" onclick="setQcStatus('${item.id}', 'na', event)" style="padding: 4px 12px; font-size: 0.78rem; font-weight: 700; border: 1px solid transparent; border-radius: 4px; cursor: pointer; transition: all 0.12s ease; background: transparent; color: #475569; box-shadow: none;">N/A</button>
                        </div>
                    </div>
                </div>`;
        });
        secHtml += `</div>`;
        return secHtml;
    };

    document.getElementById("qc-col-integrity").innerHTML = buildColumnContent("Data Integrity", qcSchema.integrity);
    document.getElementById("qc-col-communication").innerHTML = buildColumnContent("Communication", qcSchema.communication);
    document.getElementById("qc-modal-subject-safeguard").innerText = subject || 'No case subject description extracted from trace logs.';
    
    calculateQcLiveScore();
}

function closeQcModal() {
    document.getElementById("qc-modal-overlay").style.display = "none";
}

function calculateQcLiveScore() {
    let earnedIntegrity = 0, totalIntegrity = 0;
    let earnedComm = 0, totalComm = 0;
    let breakdown = [];
    
    qcSchema.integrity.forEach(item => {
        let group = document.getElementById(`qc_group_${item.id}`);
        let val = group ? group.getAttribute("data-value") : "yes";
        if (val !== "na") { totalIntegrity += item.weight; }
        if (val === "yes") { earnedIntegrity += item.weight; }
        breakdown.push({ label: item.label, value: val, weight: item.weight });
    });
    
    qcSchema.communication.forEach(item => {
        let group = document.getElementById(`qc_group_${item.id}`);
        let val = group ? group.getAttribute("data-value") : "yes";
        if (val !== "na") { totalComm += item.weight; }
        if (val === "yes") { earnedComm += item.weight; }
        breakdown.push({ label: item.label, value: val, weight: item.weight });
    });
    
    let totalMax = totalIntegrity + totalComm;
    let totalEarned = earnedIntegrity + earnedComm;
    let pct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 100;
    
    const display = document.getElementById("qc-live-score");
    if(display) {
        display.innerText = `${pct}% (${totalEarned}/${totalMax} pts)`;
        display.style.color = pct >= 90 ? "#16A34A" : (pct >= 75 ? "#D97706" : "#DC2626");
    }
    
    return { earnedIntegrity, earnedComm, totalEarned, totalMax, pct, breakdown };
}

async function submitQcEvaluation() {
    const scores = calculateQcLiveScore();
    const auditorName = document.getElementById("qc_auditor_name").value || "Anonymous Auditor";
    const comments = document.getElementById("qc_comments").value || "No comments provided.";
    
    const payload = {
        analyst: activeTargetName,
        case_number: currentQcTargetCase,
        case_closed_month: currentQcClosedMonth,
        score_integrity: scores.earnedIntegrity,
        score_comm: scores.earnedComm,
        total_score: scores.totalEarned,
        max_score: scores.totalMax,
        percentage: scores.pct,
        auditor: auditorName, 
        comments: comments,   
        breakdown: scores.breakdown 
    };
    
    let result = await eel.save_qc_evaluation(payload)();
    if (result.success) {
        showToast(result.message, "success");
        closeQcModal();
        
        const btnEvaluations = document.getElementById("audit-tab-evaluations");
        if (btnEvaluations && btnEvaluations.classList.contains("active")) {
            loadEvaluationsTab(activeTargetName);
        }
    } else {
        showToast(`Failed to save QC: ${result.error}`, "error");
    }
}

async function triggerDeleteQcEvaluation(caseNumber) {
    if (!confirm(`Are you sure you want to permanently delete the QC evaluation record for case ${caseNumber}?`)) {
        return;
    }
    
    let res = await eel.delete_qc_evaluation(caseNumber, activeTargetName)();
    if (res.success) {
        showToast(res.message || "Record successfully removed.", "success");
        loadEvaluationsTab(activeTargetName);
    } else {
        showToast(`Deletion Error: ${res.error}`, "error");
    }
}

function openQcDetailsModal(qcData) {
    let existingModal = document.getElementById("qc-details-modal-overlay");
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="qc-details-modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); z-index: 999999; justify-content: center; align-items: center;">
            <div style="background: #FFFFFF; width: 700px; max-height: 90vh; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; overflow: hidden;">
                <div style="background: #1E293B; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="color: #FFFFFF; font-size: 1.1rem; margin: 0;">Evaluation Report <span style="color: #38BDF8; font-family: monospace;">| ${qcData.case_number}</span></h2>
                    <button onclick="document.getElementById('qc-details-modal-overlay').remove()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 20px;">

                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 12px;">
                        <div>
                            <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Analyst</div>
                            <div style="font-size: 1.05rem; font-weight: 700; color: #1E293B;">${qcData.analyst}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Auditor</div>
                            <div style="font-size: 1.05rem; font-weight: 700; color: #1E293B;">${qcData.auditor || 'Anonymous'}</div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 16px;">
                        <div style="flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; text-align: center;">
                            <div style="font-size: 0.75rem; font-weight: 700; color: #64748B; text-transform: uppercase;">Total Score</div>
                            <div style="font-size: 2rem; font-weight: 800; color: ${qcData.percentage >= 90 ? '#16A34A' : (qcData.percentage >= 75 ? '#D97706' : '#DC2626')};">${qcData.percentage}%</div>
                            <div style="font-size: 0.8rem; font-weight: 600; color: #475569;">${qcData.total_score} / ${qcData.max_score} pts</div>
                        </div>
                        <div style="flex: 2; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; justify-content: center; gap: 8px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; border-bottom: 1px dashed #E2E8F0; padding-bottom: 4px;">
                                <span style="color: #64748B; font-weight: 600;">Data Integrity</span>
                                <span style="color: #0F172A; font-weight: 700;">${qcData.score_integrity} pts</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                <span style="color: #64748B; font-weight: 600;">Communication</span>
                                <span style="color: #0F172A; font-weight: 700;">${qcData.score_comm} pts</span>
                            </div>
                            <div style="font-size: 0.75rem; color: #94A3B8; font-style: italic; text-align: right; margin-top: 4px;">Evaluated on: ${qcData.timestamp}</div>
                        </div>
                    </div>

                    <div style="background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 14px 16px; border-radius: 6px;">
                        <h4 style="margin: 0 0 6px 0; color: #B45309; font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;">Auditor Comments</h4>
                        <p style="margin: 0; font-size: 0.86rem; color: #78350F; font-weight: 500; line-height: 1.45; white-space: pre-wrap;">${qcData.comments || 'No comments provided for this evaluation.'}</p>
                    </div>

                    ${qcData.breakdown && qcData.breakdown.length > 0 ? `
                    <div>
                        <h4 style="margin: 0 0 10px 0; color: #1E293B; font-size: 0.9rem; font-weight: 700; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">Line-Item Breakdown</h4>
                        <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                            ${qcData.breakdown.map(item => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.82rem; padding: 6px 10px; background: #F8FAFC; border-radius: 4px; border: 1px solid #F1F5F9;">
                                    <span style="color: #475569; font-weight: 500;">${item.label}</span>
                                    <span style="font-weight: 700; color: ${item.value === 'yes' ? '#16A34A' : (item.value === 'no' ? '#DC2626' : '#94A3B8')};">
                                        ${item.value === 'yes' ? `YES (+${item.weight})` : (item.value === 'no' ? 'NO (0)' : 'N/A')}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : `<div style="font-size: 0.8rem; color: #94A3B8; font-style: italic; text-align: center;">Detailed line-item breakdown is not available for older historical records.</div>`}

                </div>
                <div style="padding: 16px 24px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button class="btn btn-secondary" onclick="document.getElementById('qc-details-modal-overlay').remove()">Close Report</button>
                    <button class="btn btn-primary" id="btn-copy-qc-email">Copy QC for Email</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById("btn-copy-qc-email").onclick = () => {
        let text = `QUALITY ASSURANCE (QA) EVALUATION REPORT\n`;
        text += `---------------------------------------------------\n`;
        text += `Case Number: ${qcData.case_number}\n`;
        text += `Analyst: ${qcData.analyst}\n`;
        text += `Auditor: ${qcData.auditor || 'Anonymous'}\n`;
        text += `Date Evaluated: ${qcData.timestamp}\n\n`;

        text += `FINAL SCORE: ${qcData.percentage}%\n`;
        text += `- Data Integrity: ${qcData.score_integrity} pts\n`;
        text += `- Communication: ${qcData.score_comm} pts\n`;
        text += `- Total Points: ${qcData.total_score} / ${qcData.max_score} pts\n\n`;

        text += `AUDITOR COMMENTS:\n`;
        text += `${qcData.comments || 'No comments provided.'}\n\n`;

        if (qcData.breakdown && qcData.breakdown.length > 0) {
            text += `DETAILED BREAKDOWN:\n`;
            qcData.breakdown.forEach(item => {
                let valStr = item.value === 'yes' ? 'YES (Pass)' : (item.value === 'no' ? 'NO (Fail)' : 'N/A');
                text += `- ${item.label}: ${valStr}\n`;
            });
        }

        text += `---------------------------------------------------\n`;
        text += `Automated report generated by Sabre Matrix Hub.`;

        navigator.clipboard.writeText(text).then(() => {
            showToast(`QC Report for ${qcData.case_number} copied! Ready to paste in email.`, "success");
        }).catch(err => {
            showToast("Error copying to clipboard.", "error");
        });
    };
}


window.openHelpModal = function() {
    let existingModal = document.getElementById("help-guide-modal");
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="help-guide-modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(5px); z-index: 9999999; justify-content: center; align-items: center;">
            <div style="background: #FFFFFF !important; opacity: 1 !important; width: 90vw; max-width: 780px; max-height: 88vh; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #CBD5E1;">
                
                <!-- Modal Header -->
                <div style="background: #1E293B; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #0F172A;">
                    <h3 style="color: #FFFFFF; font-size: 1.1rem; font-weight: 700; margin: 0;">💡 Quick Guide: How the Score is Calculated</h3>
                    <button onclick="document.getElementById('help-guide-modal').remove()" style="background: transparent; border: none; color: #94A3B8; font-size: 1.6rem; cursor: pointer; transition: color 0.15s ease;" onmouseover="this.style.color='#FFFFFF'" onmouseout="this.style.color='#94A3B8'">&times;</button>
                </div>
                
                <!-- Modal Body -->
                <div style="padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 20px; background: #F8FAFC;">
                    
                    <!-- Section 1: Colors & Statuses -->
                    <div style="background: #FFFFFF !important; border: 1px solid #E2E8F0; padding: 18px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                        <h4 style="color:#0F172A; margin: 0 0 12px 0; font-size: 1rem; font-weight: 700; border-bottom: 2px solid #F1F5F9; padding-bottom: 6px;">🎨 1. Colors & Visual Statuses</h4>
                        <p style="margin: 0 0 12px 0; font-size: 0.85rem; color: #475569;">Each case's visual color depends on its <strong>Days Without Touch</strong>:</p>
                        
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;">
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem;"><span class="score-pill-inline score-GREEN" style="font-size: 0.75rem; padding: 3px 8px; min-width: 80px; text-align: center;">10 - 9 pts</span> <span style="color: #1E293B;"><strong>🟢 Green:</strong> Optimal / Up-to-date case.</span></div>
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem;"><span class="score-pill-inline score-LIGHT_GREEN" style="font-size: 0.75rem; padding: 3px 8px; min-width: 80px; text-align: center;">8 - 7 pts</span> <span style="color: #1E293B;"><strong>🟢 Light Green:</strong> Good / Within normal range.</span></div>
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem;"><span class="score-pill-inline score-YELLOW" style="font-size: 0.75rem; padding: 3px 8px; min-width: 80px; text-align: center;">6 - 5 pts</span> <span style="color: #1E293B;"><strong>🟡 Yellow:</strong> Neutral / Moderate attention needed.</span></div>
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem;"><span class="score-pill-inline score-ORANGE" style="font-size: 0.75rem; padding: 3px 8px; min-width: 80px; text-align: center;">4 - 3 pts</span> <span style="color: #1E293B;"><strong>🟠 Orange:</strong> Warning / Priority attention required.</span></div>
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem;"><span class="score-pill-inline score-RED" style="font-size: 0.75rem; padding: 3px 8px; min-width: 80px; text-align: center;">2 - 1 pts</span> <span style="color: #1E293B;"><strong>🔴 Red:</strong> Critical / Prolonged inactivity.</span></div>
                        </div>

                        <div style="background: #F1F5F9; border-left: 4px solid #3B82F6; padding: 12px; border-radius: 6px;">
                            <strong style="color:#1E3A8A; font-size: 0.82rem; display:block; margin-bottom: 6px;">📌 Touch Frequency Scales:</strong>
                            <div style="font-size: 0.8rem; color: #334155; display: flex; flex-direction: column; gap: 4px;">
                                <div>• <strong>Urgent</strong> (2nd level / further action): Requires frequent touches (≤ 2 days = 10 pts).</div>
                                <div>• <strong>Normal</strong> (Customer Response): Standard pace (≤ 4 days = 10 pts).</div>
                                <div>• <strong>Relaxed</strong> (All other cases): Extended pace (≤ 4 days = 10 pts).</div>
                            </div>
                        </div>
                    </div>

                    <!-- Section 2: Protection Shields -->
                    <div style="background: #FFFFFF !important; border: 1px solid #E2E8F0; padding: 18px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                        <h4 style="color:#0F172A; margin: 0 0 12px 0; font-size: 1rem; font-weight: 700; border-bottom: 2px solid #F1F5F9; padding-bottom: 6px;">🛡️ 2. Protection Shields</h4>
                        <p style="margin: 0 0 12px 0; font-size: 0.85rem; color: #475569;">Shields prevent your cases from dropping to Orange or Red when delays depend on third parties or future releases:</p>
                        
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="background: #FEF9C3; border: 1px solid #FDE047; padding: 10px 14px; border-radius: 6px; font-size: 0.82rem;">
                                <strong style="color: #854D0E; font-size: 0.85rem;">🛡️ Standard Shield (MINIMUM FLOOR = 5 / Yellow):</strong><br>
                                <span style="color: #713F12; margin-top: 4px; display: block;"><strong>Applies to:</strong> Cases in Pending/In Progress/Resolved with sub-statuses including <em>Operations, Development, or Delivery</em>.</span>
                            </div>
                            <div style="background: #DCFCE7; border: 1px solid #86EFAC; padding: 10px 14px; border-radius: 6px; font-size: 0.82rem;">
                                <strong style="color: #166534; font-size: 0.85rem;">🛡️ Relaxed Shield (MINIMUM FLOOR = 8 / Light Green):</strong><br>
                                <span style="color: #14532D; margin-top: 4px; display: block;"><strong>Applies to:</strong> Cases with sub-statuses including <em>Next Release, Future Release, Further Prioritization, or Pending Upgrade</em>. (Exception: Resolved + 2nd Level).</span>
                            </div>
                        </div>
                    </div>

                    <!-- Section 3 & 4: Pillars and Final Score -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div style="background: #FFFFFF !important; border: 1px solid #E2E8F0; padding: 18px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                            <h4 style="color:#0F172A; margin: 0 0 12px 0; font-size: 1rem; font-weight: 700; border-bottom: 2px solid #F1F5F9; padding-bottom: 6px;">📊 3. Performance Pillars</h4>
                            <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: #334155; display: flex; flex-direction: column; gap: 8px;">
                                <li><strong>Quality Score (QS) [45%]:</strong> Average score (1–10) of your active cases in the backlog.</li>
                                <li><strong>Independency Score [15%]:</strong> % of cases closed autonomously (without linking a JIRA).</li>
                                <li><strong>Productivity Score [40%]:</strong> Monthly closure volume vs. cell target (100% = 30 closures or +/month).</li>
                            </ul>
                        </div>

                        <div style="background: #FFFFFF !important; border: 1px solid #E2E8F0; padding: 18px; border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                            <h4 style="color:#0F172A; margin: 0 0 12px 0; font-size: 1rem; font-weight: 700; border-bottom: 2px solid #F1F5F9; padding-bottom: 6px;">🎯 4. Final Balanced Score</h4>
                            <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; padding: 10px; border-radius: 6px; text-align: center; font-family: monospace; font-size: 0.8rem; font-weight: 700; color: #0F172A; margin-bottom: auto;">
                                Final Score = (QS × 0.45) + (Ind × 0.15) + (Prod × 0.40)
                            </div>
                            <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 10px; border-radius: 6px; font-size: 0.78rem; color: #1E3A8A; margin-top: 12px;">
                                <strong>👤 Note for Tech Leads:</strong> Your score equals 100% Quality Score (QS) based on your active queue.
                            </div>
                        </div>
                    </div>

                </div>
                
                <!-- Modal Footer -->
                <div style="padding: 14px 24px; background: #FFFFFF; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end;">
                    <button class="btn btn-primary" onclick="document.getElementById('help-guide-modal').remove()">Understood</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Close when clicking overlay backdrop
    const modalOverlay = document.getElementById("help-guide-modal");
    if (modalOverlay) {
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        };
    }
};