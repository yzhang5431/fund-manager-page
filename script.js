// 数据存储键名
const STORAGE_KEY = 'fundTransactions';
const HOLDINGS_KEY = 'fundHoldings';
const WEBDAV_CONFIG_KEY = 'webdavConfig';

// 全局数据数组
let transactions = [];
let holdings = [];
let webdavConfig = null;
let editingTransactionId = null;
let editingHoldingId = null;
let currentSort = { field: null, direction: 'asc' };

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    loadHoldings();
    loadWebDAVConfig();
    renderTable();
    renderHoldingsTable();
    renderRankingTable();
    updateStatistics();
    updateHoldingsStatistics();
    updateHoldingsList();
    initEventListeners();
    setDefaultDate();
});

// 设置默认日期为今天
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
}

// 初始化事件监听器
function initEventListeners() {
    // 标签页切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 表单提交
    document.getElementById('transactionForm').addEventListener('submit', handleSubmit);
    document.getElementById('holdingForm').addEventListener('submit', handleHoldingSubmit);
    
    // 计算按钮
    document.getElementById('calculateBtn').addEventListener('click', calculateProfit);
    
    // 基金查询
    document.getElementById('searchFundBtn').addEventListener('click', searchFundByCode);
    document.getElementById('searchHoldingFundBtn').addEventListener('click', searchHoldingFundByCode);
    document.getElementById('syncNetValueBtn').addEventListener('click', syncNetValue);
    
    // 导出导入
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importData);
    
    // 清空所有数据
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    
    // 搜索和筛选
    document.getElementById('searchInput').addEventListener('input', filterTable);
    document.getElementById('typeFilter').addEventListener('change', filterTable);
    document.getElementById('startDateFilter').addEventListener('change', filterTable);
    document.getElementById('endDateFilter').addEventListener('change', filterTable);
    document.getElementById('resetFilterBtn').addEventListener('click', resetFilters);
    
    // 表格排序
    document.querySelectorAll('#transactionTable .sortable').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort, 'transaction'));
    });
    document.querySelectorAll('#holdingsTable .sortable').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort, 'holdings'));
    });
    
    // 取消编辑
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
    document.getElementById('cancelHoldingEditBtn').addEventListener('click', cancelHoldingEdit);
    
    // WebDAV设置
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('syncBtn').addEventListener('click', syncWithWebDAV);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    document.querySelector('.close').addEventListener('click', closeSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveWebDAVConfig);
    document.getElementById('testConnectionBtn').addEventListener('click', testWebDAVConnection);
    
    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('settingsModal');
        if (e.target === modal) {
            closeSettings();
        }
    });
    
    // 表单重置时隐藏计算结果
    document.getElementById('transactionForm').addEventListener('reset', () => {
        document.getElementById('calculationResult').style.display = 'none';
        cancelEdit();
    });
    
    document.getElementById('holdingForm').addEventListener('reset', () => {
        cancelHoldingEdit();
    });

    // 基金名称输入框变化时更新持仓信息
    document.getElementById('fundName').addEventListener('change', fillFromHoldings);
}

// 计算收益
function calculateProfit() {
    const transactionType = document.getElementById('transactionType').value;
    const shares = parseFloat(document.getElementById('shares').value) || 0;
    const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const fee = parseFloat(document.getElementById('fee').value) || 0;
    
    // 计算成本金额
    const costAmount = shares * costPrice;
    
    // 计算收益（根据交易类型）
    let profit, profitRate;
    
    if (transactionType === '卖出') {
        // 卖出：收益 = 确认金额 - 成本金额 - 手续费
        profit = amount - costAmount - fee;
        profitRate = costAmount > 0 ? (profit / costAmount * 100) : 0;
    } else {
        // 买入：收益为0或负（手续费）
        profit = -fee;
        profitRate = 0;
    }
    
    // 显示结果
    document.getElementById('resultCostAmount').textContent = costAmount.toFixed(2);
    document.getElementById('resultProfit').textContent = profit.toFixed(2);
    document.getElementById('resultProfit').className = 'result-value ' + (profit >= 0 ? 'profit-positive' : 'profit-negative');
    document.getElementById('resultProfitRate').textContent = profitRate.toFixed(2);
    document.getElementById('resultProfitRate').className = 'result-value ' + (profitRate >= 0 ? 'profit-positive' : 'profit-negative');
    
    document.getElementById('calculationResult').style.display = 'block';
}

// 处理表单提交
function handleSubmit(e) {
    e.preventDefault();
    
    // 获取表单数据
    const formData = {
        id: editingTransactionId || Date.now(),
        transactionType: document.getElementById('transactionType').value,
        date: document.getElementById('date').value,
        fundName: document.getElementById('fundName').value,
        fundCode: document.getElementById('fundCode').value,
        netValue: parseFloat(document.getElementById('netValue').value),
        fee: parseFloat(document.getElementById('fee').value),
        amount: parseFloat(document.getElementById('amount').value),
        shares: parseFloat(document.getElementById('shares').value),
        costPrice: parseFloat(document.getElementById('costPrice').value),
        channel: document.getElementById('channel').value,
        remark: document.getElementById('remark').value
    };
    
    // 计算衍生数据
    formData.costAmount = formData.shares * formData.costPrice;
    
    if (formData.transactionType === '卖出') {
        formData.profit = formData.amount - formData.costAmount - formData.fee;
        formData.profitRate = formData.costAmount > 0 ? (formData.profit / formData.costAmount * 100) : 0;
    } else {
        formData.profit = -formData.fee;
        formData.profitRate = 0;
    }
    
    if (editingTransactionId) {
        // 编辑模式：更新现有记录
        const index = transactions.findIndex(t => t.id === editingTransactionId);
        if (index !== -1) {
            const oldTransaction = transactions[index];
            // 先撤销旧交易对持仓的影响
            updateHoldingShares(oldTransaction.fundCode || oldTransaction.fundName, 
                oldTransaction.transactionType === '买入' ? -oldTransaction.shares : oldTransaction.shares);
            // 应用新交易对持仓的影响
            updateHoldingShares(formData.fundCode || formData.fundName, 
                formData.transactionType === '买入' ? formData.shares : -formData.shares);
            transactions[index] = formData;
        }
        alert('✅ 交易记录已更新！');
    } else {
        // 新增模式：添加到数组
        transactions.unshift(formData);
        // 更新持仓份额
        updateHoldingShares(formData.fundCode || formData.fundName, 
            formData.transactionType === '买入' ? formData.shares : -formData.shares);
        alert('✅ 交易记录已保存！');
    }
    
    // 保存数据
    saveData();
    
    // 刷新表格和统计
    renderTable();
    renderHoldingsTable();
    renderRankingTable();
    updateStatistics();
    updateHoldingsStatistics();
    
    // 重置表单
    document.getElementById('transactionForm').reset();
    document.getElementById('calculationResult').style.display = 'none';
    setDefaultDate();
    cancelEdit();
}

// 渲染表格
function renderTable(data = transactions) {
    const tbody = document.getElementById('tableBody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" class="empty-message">暂无交易记录，请添加新记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><span class="type-badge ${item.transactionType === '买入' ? 'type-buy' : 'type-sell'}">${item.transactionType}</span></td>
            <td>${item.date}</td>
            <td>${item.fundName}</td>
            <td>${item.fundCode || '-'}</td>
            <td>${item.netValue.toFixed(4)}</td>
            <td>${item.fee.toFixed(2)}</td>
            <td>${item.amount.toFixed(2)}</td>
            <td>${item.shares.toFixed(2)}</td>
            <td>${item.costPrice.toFixed(4)}</td>
            <td>${item.costAmount.toFixed(2)}</td>
            <td class="${item.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${item.profit.toFixed(2)}</td>
            <td class="${item.profitRate >= 0 ? 'profit-positive' : 'profit-negative'}">${item.profitRate.toFixed(2)}%</td>
            <td>${item.channel || '-'}</td>
            <td>${item.remark || '-'}</td>
            <td>
                <button class="btn-edit" onclick="editTransaction(${item.id})">编辑</button>
                <button class="btn-delete" onclick="deleteTransaction(${item.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

// 删除交易记录
function deleteTransaction(id) {
    if (confirm('确定要删除这条记录吗？')) {
        const transaction = transactions.find(t => t.id === id);
        if (transaction) {
            // 撤销对持仓的影响
            updateHoldingShares(transaction.fundCode || transaction.fundName, 
                transaction.transactionType === '买入' ? -transaction.shares : transaction.shares);
        }
        transactions = transactions.filter(item => item.id !== id);
        saveData();
        renderTable();
        renderHoldingsTable();
        renderRankingTable();
        updateStatistics();
        updateHoldingsStatistics();
        alert('✅ 记录已删除！');
    }
}

// 筛选表格
function filterTable() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    const startDate = document.getElementById('startDateFilter').value;
    const endDate = document.getElementById('endDateFilter').value;
    
    const filtered = transactions.filter(item => {
        const matchSearch = !searchText || 
            item.fundName.toLowerCase().includes(searchText) ||
            (item.fundCode && item.fundCode.toLowerCase().includes(searchText));
        
        const matchType = !typeFilter || item.transactionType === typeFilter;
        
        const matchStartDate = !startDate || item.date >= startDate;
        const matchEndDate = !endDate || item.date <= endDate;
        
        return matchSearch && matchType && matchStartDate && matchEndDate;
    });
    
    renderTable(filtered);
}

// 重置筛选
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('startDateFilter').value = '';
    document.getElementById('endDateFilter').value = '';
    renderTable();
}

// 更新统计信息
function updateStatistics() {
    const totalCount = transactions.length;
    const buyCount = transactions.filter(t => t.transactionType === '买入').length;
    const sellCount = transactions.filter(t => t.transactionType === '卖出').length;
    const totalProfit = transactions.reduce((sum, t) => sum + (t.profit || 0), 0);
    
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('buyCount').textContent = buyCount;
    document.getElementById('sellCount').textContent = sellCount;
    document.getElementById('totalProfit').textContent = totalProfit.toFixed(2) + ' 元';
    document.getElementById('totalProfit').className = 'stat-value ' + (totalProfit >= 0 ? 'profit-positive' : 'profit-negative');
}

// 保存数据到 LocalStorage
function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

// 从 LocalStorage 加载数据
function loadData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        transactions = JSON.parse(saved);
    }
}

// 导出数据为 JSON 文件
function exportData() {
    if (transactions.length === 0) {
        alert('⚠️ 暂无数据可导出！');
        return;
    }
    
    const dataStr = JSON.stringify(transactions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `基金交易记录_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ 数据已导出！您可以将此文件上传到坚果云保存。');
}

// 导入数据
function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const imported = JSON.parse(event.target.result);
            if (Array.isArray(imported)) {
                if (confirm(`确定要导入 ${imported.length} 条记录吗？这将覆盖当前所有数据！`)) {
                    transactions = imported;
                    saveData();
                    renderTable();
                    updateStatistics();
                    alert('✅ 数据导入成功！');
                }
            } else {
                alert('❌ 文件格式错误！');
            }
        } catch (error) {
            alert('❌ 文件解析失败：' + error.message);
        }
    };
    reader.readAsText(file);
    
    // 重置文件输入
    e.target.value = '';
}

// 清空所有数据
function clearAllData() {
    if (confirm('⚠️ 确定要清空所有数据吗？此操作不可恢复！\n\n建议先导出数据备份。')) {
        if (confirm('再次确认：真的要删除所有记录吗？')) {
            transactions = [];
            saveData();
            renderTable();
            updateStatistics();
            alert('✅ 所有数据已清空！');
        }
    }
}


// ==================== 标签页切换 ====================
function switchTab(tabName) {
    // 更新标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'transaction') {
        document.getElementById('transactionTab').classList.add('active');
    } else if (tabName === 'holdings') {
        document.getElementById('holdingsTab').classList.add('active');
    } else if (tabName === 'analysis') {
        document.getElementById('analysisTab').classList.add('active');
    }
}

// ==================== 编辑交易记录 ====================
function editTransaction(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    
    editingTransactionId = id;
    
    // 填充表单
    document.getElementById('transactionType').value = transaction.transactionType;
    document.getElementById('date').value = transaction.date;
    document.getElementById('fundName').value = transaction.fundName;
    document.getElementById('fundCode').value = transaction.fundCode;
    document.getElementById('netValue').value = transaction.netValue;
    document.getElementById('fee').value = transaction.fee;
    document.getElementById('amount').value = transaction.amount;
    document.getElementById('shares').value = transaction.shares;
    document.getElementById('costPrice').value = transaction.costPrice;
    document.getElementById('channel').value = transaction.channel;
    document.getElementById('remark').value = transaction.remark;
    
    // 更新UI
    document.getElementById('formTitle').textContent = '编辑交易记录';
    document.getElementById('submitBtn').textContent = '更新记录';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    
    // 滚动到表单
    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
    
    // 显示计算结果
    calculateProfit();
}

function cancelEdit() {
    editingTransactionId = null;
    document.getElementById('formTitle').textContent = '新增交易记录';
    document.getElementById('submitBtn').textContent = '保存记录';
    document.getElementById('cancelEditBtn').style.display = 'none';
}

// ==================== 表格排序 ====================
function sortTable(field, tableType) {
    const dataArray = tableType === 'transaction' ? transactions : holdings;
    
    // 切换排序方向
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    
    // 排序数据
    dataArray.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        
        // 处理字符串
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (currentSort.direction === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    // 更新表头样式
    const table = tableType === 'transaction' ? '#transactionTable' : '#holdingsTable';
    document.querySelectorAll(`${table} .sortable`).forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === field) {
            th.classList.add(currentSort.direction);
        }
    });
    
    // 重新渲染
    if (tableType === 'transaction') {
        renderTable();
    } else {
        renderHoldingsTable();
    }
}

// ==================== 基金代码查询 ====================
async function searchFundByCode() {
    const code = document.getElementById('fundCode').value.trim();
    if (!code) {
        alert('请先输入基金代码');
        return;
    }
    
    try {
        const fundName = await getFundNameByCode(code);
        if (fundName) {
            document.getElementById('fundName').value = fundName;
            alert('✅ 查询成功！');
        } else {
            alert('❌ 未找到该基金，请检查代码是否正确');
        }
    } catch (error) {
        alert('❌ 查询失败：' + error.message);
    }
}

async function searchHoldingFundByCode() {
    const code = document.getElementById('holdingFundCode').value.trim();
    if (!code) {
        alert('请先输入基金代码');
        return;
    }
    
    try {
        const fundName = await getFundNameByCode(code);
        if (fundName) {
            document.getElementById('holdingFundName').value = fundName;
            alert('✅ 查询成功！');
        } else {
            alert('❌ 未找到该基金，请检查代码是否正确');
        }
    } catch (error) {
        alert('❌ 查询失败：' + error.message);
    }
}

// 通过基金代码获取基金名称（使用天天基金API）
async function getFundNameByCode(code) {
    try {
        // 使用天天基金的JSONP接口
        const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
        const response = await fetch(url);
        const text = await response.text();
        
        // 解析JSONP返回的数据
        const match = text.match(/jsonpgz\((.*)\)/);
        if (match) {
            const data = JSON.parse(match[1]);
            return data.name;
        }
        return null;
    } catch (error) {
        console.error('查询基金失败:', error);
        return null;
    }
}

// 同步最新净值
async function syncNetValue() {
    const code = document.getElementById('holdingFundCode').value.trim();
    if (!code) {
        alert('请先输入基金代码');
        return;
    }
    
    try {
        const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
        const response = await fetch(url);
        const text = await response.text();
        
        const match = text.match(/jsonpgz\((.*)\)/);
        if (match) {
            const data = JSON.parse(match[1]);
            document.getElementById('holdingCurrentValue').value = data.gsz || data.dwjz;
            alert(`✅ 已同步最新净值：${data.gsz || data.dwjz}`);
        } else {
            alert('❌ 获取净值失败');
        }
    } catch (error) {
        alert('❌ 同步失败：' + error.message);
    }
}

// ==================== 持仓管理 ====================
function loadHoldings() {
    const saved = localStorage.getItem(HOLDINGS_KEY);
    if (saved) {
        holdings = JSON.parse(saved);
    }
}

function saveHoldings() {
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
}

// 更新持仓份额（根据交易记录）
function updateHoldingShares(fundIdentifier, shareChange) {
    // 根据基金代码或名称查找持仓
    const holding = holdings.find(h => 
        (h.fundCode && h.fundCode === fundIdentifier) || 
        h.fundName === fundIdentifier
    );
    
    if (holding) {
        holding.shares += shareChange;
        // 重新计算相关数据
        holding.costAmount = holding.shares * holding.costPrice;
        holding.marketValue = holding.shares * holding.currentValue;
        holding.profit = holding.marketValue - holding.costAmount;
        holding.profitRate = holding.costAmount > 0 ? (holding.profit / holding.costAmount * 100) : 0;
        
        // 如果份额为0或负数，提示用户
        if (holding.shares <= 0) {
            if (confirm(`${holding.fundName} 的持仓份额已为 ${holding.shares.toFixed(2)}，是否删除该持仓？`)) {
                holdings = holdings.filter(h => h.id !== holding.id);
            } else {
                holding.shares = 0;
            }
        }
        
        saveHoldings();
    }
    // 如果没有找到持仓，不做处理（用户可能还没添加持仓）
}

function handleHoldingSubmit(e) {
    e.preventDefault();
    
    const formData = {
        id: editingHoldingId || Date.now(),
        fundName: document.getElementById('holdingFundName').value,
        fundCode: document.getElementById('holdingFundCode').value,
        costPrice: parseFloat(document.getElementById('holdingCostPrice').value),
        shares: parseFloat(document.getElementById('holdingShares').value) || 0,
        currentValue: parseFloat(document.getElementById('holdingCurrentValue').value) || 0,
        remark: document.getElementById('holdingRemark').value
    };
    
    // 计算衍生数据
    formData.costAmount = formData.shares * formData.costPrice;
    formData.marketValue = formData.shares * formData.currentValue;
    formData.profit = formData.marketValue - formData.costAmount;
    formData.profitRate = formData.costAmount > 0 ? (formData.profit / formData.costAmount * 100) : 0;
    
    if (editingHoldingId) {
        const index = holdings.findIndex(h => h.id === editingHoldingId);
        if (index !== -1) {
            holdings[index] = formData;
        }
        alert('✅ 持仓记录已更新！');
    } else {
        holdings.unshift(formData);
        alert('✅ 持仓记录已保存！');
    }
    
    saveHoldings();
    renderHoldingsTable();
    updateHoldingsStatistics();
    updateHoldingsList();
    
    document.getElementById('holdingForm').reset();
    cancelHoldingEdit();
}

function renderHoldingsTable(data = holdings) {
    const tbody = document.getElementById('holdingsTableBody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-message">暂无持仓记录，请添加持仓基金</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.fundName}</td>
            <td>${item.fundCode}</td>
            <td>${item.costPrice.toFixed(4)}</td>
            <td>${item.shares.toFixed(2)}</td>
            <td>${item.costAmount.toFixed(2)}</td>
            <td>${item.currentValue.toFixed(4)}</td>
            <td>${item.marketValue.toFixed(2)}</td>
            <td class="${item.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${item.profit.toFixed(2)}</td>
            <td class="${item.profitRate >= 0 ? 'profit-positive' : 'profit-negative'}">${item.profitRate.toFixed(2)}%</td>
            <td>${item.remark || '-'}</td>
            <td>
                <button class="btn-edit" onclick="editHolding(${item.id})">编辑</button>
                <button class="btn-delete" onclick="deleteHolding(${item.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

function editHolding(id) {
    const holding = holdings.find(h => h.id === id);
    if (!holding) return;
    
    editingHoldingId = id;
    
    document.getElementById('holdingFundName').value = holding.fundName;
    document.getElementById('holdingFundCode').value = holding.fundCode;
    document.getElementById('holdingCostPrice').value = holding.costPrice;
    document.getElementById('holdingShares').value = holding.shares;
    document.getElementById('holdingCurrentValue').value = holding.currentValue;
    document.getElementById('holdingRemark').value = holding.remark;
    
    document.getElementById('holdingFormTitle').textContent = '编辑持仓基金';
    document.getElementById('submitHoldingBtn').textContent = '更新持仓';
    document.getElementById('cancelHoldingEditBtn').style.display = 'inline-block';
    
    document.querySelector('#holdingsTab .form-section').scrollIntoView({ behavior: 'smooth' });
}

function cancelHoldingEdit() {
    editingHoldingId = null;
    document.getElementById('holdingFormTitle').textContent = '新增持仓基金';
    document.getElementById('submitHoldingBtn').textContent = '保存持仓';
    document.getElementById('cancelHoldingEditBtn').style.display = 'none';
}

function deleteHolding(id) {
    if (confirm('确定要删除这条持仓记录吗？')) {
        holdings = holdings.filter(item => item.id !== id);
        saveHoldings();
        renderHoldingsTable();
        updateHoldingsStatistics();
        updateHoldingsList();
        alert('✅ 记录已删除！');
    }
}

function updateHoldingsStatistics() {
    const holdingCount = holdings.length;
    const totalCost = holdings.reduce((sum, h) => sum + h.costAmount, 0);
    const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalProfit = totalMarketValue - totalCost;
    
    document.getElementById('holdingCount').textContent = holdingCount;
    document.getElementById('totalCost').textContent = totalCost.toFixed(2) + ' 元';
    document.getElementById('totalMarketValue').textContent = totalMarketValue.toFixed(2) + ' 元';
    document.getElementById('totalHoldingProfit').textContent = totalProfit.toFixed(2) + ' 元';
    document.getElementById('totalHoldingProfit').className = 'stat-value ' + (totalProfit >= 0 ? 'profit-positive' : 'profit-negative');
}

// 更新持仓列表（用于交易表单的下拉选择）
function updateHoldingsList() {
    const datalist = document.getElementById('holdingsList');
    datalist.innerHTML = holdings.map(h => 
        `<option value="${h.fundName}" data-code="${h.fundCode}" data-price="${h.costPrice}">`
    ).join('');
}

// 从持仓列表填充表单
function fillFromHoldings() {
    const fundName = document.getElementById('fundName').value;
    const holding = holdings.find(h => h.fundName === fundName);
    
    if (holding) {
        document.getElementById('fundCode').value = holding.fundCode;
        document.getElementById('costPrice').value = holding.costPrice;
    }
}

// ==================== 收益分析 ====================
function renderRankingTable() {
    const tbody = document.getElementById('rankingTableBody');
    
    // 按基金分组统计
    const fundStats = {};
    
    transactions.forEach(t => {
        const key = t.fundCode || t.fundName;
        if (!fundStats[key]) {
            fundStats[key] = {
                fundName: t.fundName,
                fundCode: t.fundCode,
                count: 0,
                totalProfit: 0,
                profits: []
            };
        }
        
        fundStats[key].count++;
        fundStats[key].totalProfit += t.profit;
        fundStats[key].profits.push(t.profit);
    });
    
    // 转换为数组并排序
    const ranking = Object.values(fundStats).map(stat => ({
        ...stat,
        avgProfitRate: stat.profits.length > 0 ? 
            stat.profits.reduce((sum, p) => sum + p, 0) / stat.profits.length : 0,
        maxProfit: Math.max(...stat.profits),
        minProfit: Math.min(...stat.profits)
    })).sort((a, b) => b.totalProfit - a.totalProfit);
    
    if (ranking.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-message">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = ranking.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.fundName}</td>
            <td>${item.fundCode || '-'}</td>
            <td>${item.count}</td>
            <td class="${item.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${item.totalProfit.toFixed(2)}</td>
            <td class="${item.avgProfitRate >= 0 ? 'profit-positive' : 'profit-negative'}">${item.avgProfitRate.toFixed(2)}%</td>
            <td class="${item.maxProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${item.maxProfit.toFixed(2)}</td>
            <td class="${item.minProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${item.minProfit.toFixed(2)}</td>
        </tr>
    `).join('');
}

// ==================== WebDAV云同步 ====================
function loadWebDAVConfig() {
    const saved = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (saved) {
        webdavConfig = JSON.parse(saved);
    }
}

function openSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'block';
    
    if (webdavConfig) {
        document.getElementById('webdavUrl').value = webdavConfig.url || '';
        document.getElementById('webdavUsername').value = webdavConfig.username || '';
        document.getElementById('webdavPassword').value = webdavConfig.password || '';
        document.getElementById('webdavPath').value = webdavConfig.path || '/fund-data.json';
    }
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function saveWebDAVConfig() {
    const url = document.getElementById('webdavUrl').value.trim();
    const username = document.getElementById('webdavUsername').value.trim();
    const password = document.getElementById('webdavPassword').value.trim();
    const path = document.getElementById('webdavPath').value.trim();
    
    if (!url || !username || !password) {
        showSyncStatus('请填写完整的WebDAV配置信息', 'error');
        return;
    }
    
    webdavConfig = { url, username, password, path };
    localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(webdavConfig));
    
    showSyncStatus('✅ 配置已保存', 'success');
}

async function testWebDAVConnection() {
    if (!webdavConfig) {
        showSyncStatus('请先保存配置', 'error');
        return;
    }
    
    showSyncStatus('正在测试连接...', 'info');
    
    try {
        const response = await fetch(webdavConfig.url, {
            method: 'PROPFIND',
            headers: {
                'Authorization': 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password),
                'Depth': '0'
            }
        });
        
        if (response.ok || response.status === 207) {
            showSyncStatus('✅ 连接成功！', 'success');
        } else {
            showSyncStatus('❌ 连接失败：' + response.statusText, 'error');
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            showSyncStatus('❌ 连接失败：CORS跨域限制。\n\n解决方案：\n1. 部署到GitHub Pages后使用（推荐）\n2. 或使用本地服务器运行\n3. 本地文件(file://)无法直接访问WebDAV', 'error');
        } else {
            showSyncStatus('❌ 连接失败：' + error.message, 'error');
        }
    }
}

async function syncWithWebDAV() {
    if (!webdavConfig) {
        alert('⚠️ 请先配置WebDAV设置\n\n注意：本地文件(file://)无法使用WebDAV功能\n请部署到GitHub Pages后使用');
        openSettings();
        return;
    }
    
    const choice = confirm('确定要同步数据到云端吗？\n\n✅ 点击"确定"：上传本地数据到云端\n❌ 点击"取消"：从云端下载数据到本地\n\n⚠️ 注意：本地文件(file://)可能无法使用此功能\n建议部署到GitHub Pages后使用');
    
    if (choice) {
        // 上传数据
        await uploadToWebDAV();
    } else {
        // 下载数据
        await downloadFromWebDAV();
    }
}

async function uploadToWebDAV() {
    try {
        const data = {
            transactions,
            holdings,
            exportTime: new Date().toISOString()
        };
        
        const response = await fetch(webdavConfig.url + webdavConfig.path, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data, null, 2)
        });
        
        if (response.ok || response.status === 201 || response.status === 204) {
            alert('✅ 数据已上传到云端！');
        } else {
            alert('❌ 上传失败：' + response.statusText);
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            alert('❌ 上传失败：CORS跨域限制\n\n本地文件(file://)无法使用WebDAV功能\n请部署到GitHub Pages后使用\n\n临时方案：使用"导出数据"功能手动备份');
        } else {
            alert('❌ 上传失败：' + error.message);
        }
    }
}

async function downloadFromWebDAV() {
    try {
        const response = await fetch(webdavConfig.url + webdavConfig.path, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password)
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (confirm(`从云端找到数据：\n交易记录：${data.transactions?.length || 0} 条\n持仓记录：${data.holdings?.length || 0} 条\n\n确定要覆盖本地数据吗？`)) {
                transactions = data.transactions || [];
                holdings = data.holdings || [];
                saveData();
                saveHoldings();
                renderTable();
                renderHoldingsTable();
                renderRankingTable();
                updateStatistics();
                updateHoldingsStatistics();
                updateHoldingsList();
                alert('✅ 数据已从云端下载！');
            }
        } else if (response.status === 404) {
            alert('云端暂无数据文件，请先上传数据');
        } else {
            alert('❌ 下载失败：' + response.statusText);
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            alert('❌ 下载失败：CORS跨域限制\n\n本地文件(file://)无法使用WebDAV功能\n请部署到GitHub Pages后使用\n\n临时方案：使用"导入数据"功能手动恢复');
        } else {
            alert('❌ 下载失败：' + error.message);
        }
    }
}

function showSyncStatus(message, type) {
    const statusDiv = document.getElementById('syncStatus');
    statusDiv.textContent = message;
    statusDiv.className = 'sync-status ' + type;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}
