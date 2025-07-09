// -- DOM ELEMENT SELECTION --
const profileSelect = document.getElementById('profile-select');
const saveProfileBtn = document.getElementById('save-profile-btn');
const deleteProfileBtn = document.getElementById('delete-profile-btn');
const profileNameInput = document.getElementById('profile-name');
const platformIosRadio = document.getElementById('platform-ios');
const platformAndroidRadio = document.getElementById('platform-android');
const iosFields = document.getElementById('ios-fields');
const androidFields = document.getElementById('android-fields');
const certP8Radio = document.getElementById('cert-p8');
const certP12Radio = document.getElementById('cert-p12');
const p8Fields = document.getElementById('p8-fields');
const p12Fields = document.getElementById('p12-fields');
const filePickerBtns = document.querySelectorAll('.file-picker-btn');
const sendPushBtn = document.getElementById('send-push-btn');
const logArea = document.getElementById('log-area');
const tokensTextarea = document.getElementById('device-tokens');
const payloadTextarea = document.getElementById('payload');

const navSettings = document.getElementById('nav-push');
const navSupport = document.getElementById('nav-support');
const settingsPage = document.getElementById('push-page');
const supportPage = document.getElementById('support-page');
const profileManager = document.getElementById('profile-manager');

// -- STATE & DEFAULTS --
let filePaths = {
    p8Path: '',
    p12Path: '',
    serviceAccountPath: ''
};

const defaultPayloads = {
    ios: JSON.stringify({
        "aps": {
            "alert": {
                "title": "Test Title",
                "body": "This is a test notification."
            },
            "badge": 1,
            "sound": "default"
        },
        "data": { "customKey": "customValue" }
    }, null, 4),
    android: JSON.stringify({
        "notification": {
            "title": "Test Title",
            "body": "This is a test notification."
        },
        "data": { "customKey": "customValue" }
    }, null, 4)
};

// -- EVENT LISTENERS --
document.addEventListener('DOMContentLoaded', () => {
    loadProfiles();
    resetForm();
    setAppVersions();
});

document.querySelectorAll('input[name="platform"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const isIos = platformIosRadio.checked;
        payloadTextarea.value = isIos ? defaultPayloads.ios : defaultPayloads.android;
        togglePlatformFields();
    });
});
document.querySelectorAll('input[name="cert-type"]').forEach(radio => radio.addEventListener('change', toggleCertTypeFields));
filePickerBtns.forEach(btn => btn.addEventListener('click', handleFilePick));
saveProfileBtn.addEventListener('click', saveCurrentProfile);
profileSelect.addEventListener('change', loadSelectedProfile);
deleteProfileBtn.addEventListener('click', deleteSelectedProfile);
sendPushBtn.addEventListener('click', handleSendPush);

navSettings.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('settings');
});

navSupport.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('support');
});

// -- FUNCTIONS --

function showPage(pageName) {
    if (pageName === 'settings') {
        settingsPage.classList.remove('hidden');
        supportPage.classList.add('hidden');
        profileManager.classList.remove('hidden');
        navSettings.classList.add('active');
        navSupport.classList.remove('active');
    } else if (pageName === 'support') {
        settingsPage.classList.add('hidden');
        supportPage.classList.remove('hidden');
        profileManager.classList.add('hidden');
        navSettings.classList.remove('active');
        navSupport.classList.add('active');
    }
}

async function loadProfiles() {
    const profiles = await window.api.getProfiles();
    profileSelect.innerHTML = '<option value="">Create New Profile...</option>';
    for (const name in profiles) {
        const option = new Option(name, name);
        profileSelect.appendChild(option);
    }
}

async function loadSelectedProfile() {
    const profileName = profileSelect.value;
    if (!profileName) {
        resetForm();
        return;
    }
    const profiles = await window.api.getProfiles();
    const profile = profiles[profileName];

    tokensTextarea.value = profile.tokens || '';
    profileNameInput.value = profile.name || '';
    
    platformIosRadio.checked = profile.platform === 'ios';
    platformAndroidRadio.checked = profile.platform === 'android';
    
    payloadTextarea.value = profile.payload || (platformIosRadio.checked ? defaultPayloads.ios : defaultPayloads.android);

    if (profile.platform === 'ios') {
        document.getElementById('bundle-id').value = profile.bundleId || '';
        document.getElementById('is-production-env').checked = profile.isProduction || false;
        certP12Radio.checked = profile.certType === 'p12';
        certP8Radio.checked = profile.certType !== 'p12';
        filePaths.p8Path = profile.p8Path || '';
        filePaths.p12Path = profile.p12Path || '';
        document.getElementById('p8-path-display').textContent = profile.p8Path || '';
        document.getElementById('p12-path-display').textContent = profile.p12Path || '';
        document.getElementById('key-id').value = profile.keyId || '';
        document.getElementById('team-id').value = profile.teamId || '';
        document.getElementById('p12-password').value = profile.p12Password || '';
    } else { // Android
        filePaths.serviceAccountPath = profile.serviceAccountPath || '';
        document.getElementById('sa-path-display').textContent = profile.serviceAccountPath || '';
        document.getElementById('dry-run').checked = profile.isDryRun || false;
    }
    
    togglePlatformFields();
}

function resetForm() {
    document.getElementById('push-form').reset();
    profileNameInput.value = '';
    filePaths = { p8Path: '', p12Path: '', serviceAccountPath: '' };
    document.querySelectorAll('.file-path-display').forEach(el => el.textContent = '');
    tokensTextarea.value = '';
    platformIosRadio.checked = true;
    payloadTextarea.value = defaultPayloads.ios;
    togglePlatformFields();
}

async function saveCurrentProfile() {
    const profileName = profileNameInput.value.trim();
    if (!profileName) {
        addToLog('Error: Please enter a profile name.', 'error');
        return;
    }
    const profile = {
        name: profileName,
        platform: platformIosRadio.checked ? 'ios' : 'android',
        isDryRun: document.getElementById('dry-run').checked,
        tokens: tokensTextarea.value,
        payload: payloadTextarea.value
    };

    if (profile.platform === 'ios') {
        profile.certType = certP8Radio.checked ? 'p8' : 'p12';
        profile.bundleId = document.getElementById('bundle-id').value;
        profile.isProduction = document.getElementById('is-production-env').checked;
        if (profile.certType === 'p8') {
            profile.p8Path = filePaths.p8Path;
            profile.keyId = document.getElementById('key-id').value;
            profile.teamId = document.getElementById('team-id').value;
        } else {
            profile.p12Path = filePaths.p12Path;
            profile.p12Password = document.getElementById('p12-password').value;
        }
    } else {
        profile.serviceAccountPath = filePaths.serviceAccountPath;
    }
    await window.api.saveProfile(profile);
    addToLog(`Profile '${profileName}' was saved/updated.`, 'success');
    await loadProfiles();
    profileSelect.value = profileName;
}

async function deleteSelectedProfile() {
    const profileName = profileSelect.value;
    if (!profileName) {
        addToLog('Please select a profile to delete.', 'error');
        return;
    }
    await window.api.deleteProfile(profileName);
    addToLog(`Profile '${profileName}' was deleted.`, 'success');
    resetForm();
    await loadProfiles();
}

function togglePlatformFields() {
    const isIos = platformIosRadio.checked;
    iosFields.classList.toggle('hidden', !isIos);
    androidFields.classList.toggle('hidden', isIos);
    toggleCertTypeFields();
}

function toggleCertTypeFields() {
    if (platformAndroidRadio.checked) return;
    const isP8 = certP8Radio.checked;
    p8Fields.classList.toggle('hidden', !isP8);
    p12Fields.classList.toggle('hidden', isP8);
}

async function setAppVersions() {
    const versions = await window.api.getAppVersions();
    const appVersionEl = document.getElementById('app-version');
    const buildVersionEl = document.getElementById('build-version');

    if (appVersionEl) {
        appVersionEl.textContent = versions.version;
    }
    if (buildVersionEl) {
        buildVersionEl.textContent = versions.buildVersion;
    }
}

async function handleFilePick(event) {
    const target = event.target.dataset.target;
    const filters = {
        'p8-path': [{ name: 'P8 Auth Key', extensions: ['p8'] }],
        'p12-path': [{ name: 'P12 Certificate', extensions: ['p12', 'pfx'] }],
        'sa-path': [{ name: 'Service Account JSON', extensions: ['json'] }]
    };
    const path = await window.api.openFileDialog(filters[target]);
    if (path) {
        filePaths[target.replace('-path', 'Path')] = path;
        document.getElementById(`${target}-display`).textContent = path;
    }
}

async function handleSendPush() {
    logArea.innerHTML = '';
    addToLog('Preparing push request...');

    const profile = {
        platform: platformIosRadio.checked ? 'ios' : 'android',
        certType: certP8Radio.checked ? 'p8' : 'p12',
        bundleId: document.getElementById('bundle-id').value,
        isProduction: document.getElementById('is-production-env').checked,
        p8Path: filePaths.p8Path,
        keyId: document.getElementById('key-id').value,
        teamId: document.getElementById('team-id').value,
        p12Path: filePaths.p12Path,
        p12Password: document.getElementById('p12-password').value,
        serviceAccountPath: filePaths.serviceAccountPath,
        name: profileNameInput.value.trim()
    };
    
    const tokens = tokensTextarea.value.split('\n').map(t => t.trim()).filter(t => t);
    if (tokens.length === 0) {
        addToLog('Error: No device tokens provided.', 'error');
        return;
    }

    const payload = payloadTextarea.value;
    try {
        JSON.parse(payload);
    } catch (e) {
        addToLog(`Error: Invalid JSON Payload! ${e.message}`, 'error');
        return;
    }

    sendPushBtn.disabled = true;
    sendPushBtn.textContent = 'Sending...';

    const result = await window.api.sendPush({
        profile,
        tokens,
        payload,
        isDryRun: document.getElementById('dry-run').checked
    });
    
    result.logs.forEach(log => {
        let type = 'info';
        if (log.toLowerCase().includes('error') || log.toLowerCase().includes('hata')) type = 'error';
        if (log.toLowerCase().includes('success') || log.toLowerCase().includes('başarılı')) type = 'success';
        addToLog(log, type);
    });

    sendPushBtn.disabled = false;
    sendPushBtn.textContent = 'Send Push Notification';
}

function addToLog(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    p.className = `log-${type}`;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight;
}
