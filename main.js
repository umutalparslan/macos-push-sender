const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron'); // <-- Menu'yü buraya ekleyin
const path = require('path');
const Store = require('electron-store');
const apn = require('node-apn');
const admin = require('firebase-admin');

// Kullanıcı verilerini saklamak için store oluştur
const store = new Store();

// Firebase uygulamalarını başlatıldıkça saklamak için bir obje
const firebaseApps = {};

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      // preload.js script'ini yükle
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Geliştirici araçlarını açmak için (isteğe bağlı)
  //mainWindow.webContents.openDevTools();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Güvenlik için, sadece https ile başlayan linklerin dışarıda açılmasına izin ver
    if (url.startsWith('https://')) {
      // shell modülünü kullanarak linki kullanıcının varsayılan tarayıcısında aç
      shell.openExternal(url);
    }
    // Electron'un yeni bir uygulama penceresi oluşturmasını engelle
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.setName('MacOS Push Sender');

  // Menü şablonunu oluşturuyoruz.
  const menuTemplate = [
    {
      label: app.getName(), // app.name yerine app.getName() kullanmak daha güvenilirdir.
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: `About ${app.getName()}`,
              message: `${app.getName()} v${app.getVersion()}`,
              detail: 'A simple tool to send push notifications to iOS and Android devices.\nDeveloped by Umut Can Alparslan.',
              buttons: ['OK']
            });
          }
        },
        // ... menünün geri kalanı ...
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    // ... File, Edit, View, Window menüleri olduğu gibi kalacak ...
    {
      label: 'File',
      submenu: [
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    }
  ];

  // Şablondan menüyü oluştur
  const menu = Menu.buildFromTemplate(menuTemplate);
  // Ve menüyü uygulama menüsü olarak ayarla
  Menu.setApplicationMenu(menu);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


ipcMain.handle('get-app-versions', () => {
  const pjson = require('./package.json');
  return {
    version: pjson.version,
    buildVersion: pjson.build.buildVersion
  };
});



// -- ARAYÜZDEN GELEN İSTEKLERİ YAKALAMA (IPC) --

// Dosya seçme penceresini açar
ipcMain.handle('dialog:openFile', async (event, filter) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filter,
  });
  if (canceled) {
    return;
  } else {
    return filePaths[0];
  }
});

// Kayıtlı profilleri getirir
ipcMain.handle('store:getProfiles', () => {
  return store.get('profiles', {});
});

// Profili kaydeder
ipcMain.handle('store:saveProfile', (event, profile) => {
  const profiles = store.get('profiles', {});
  profiles[profile.name] = profile;
  store.set('profiles', profiles);
  return profiles;
});

// Profili siler
ipcMain.handle('store:deleteProfile', (event, profileName) => {
    const profiles = store.get('profiles', {});
    delete profiles[profileName];
    store.set('profiles', profiles);
    return profiles;
});


// PUSH GÖNDERME ANA FONKSİYONU
ipcMain.handle('send:push', async (event, { profile, tokens, payload, isDryRun }) => {
  const logs = [];
  const addLog = (message) => logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
  
  addLog('Push sending process initiated.');

  try {
    if (profile.platform === 'ios') {
      await sendIosPush(profile, tokens, payload, addLog);
    } else if (profile.platform === 'android') {
      await sendAndroidPush(profile, tokens, payload, isDryRun, addLog);
    }
    addLog('All notifications have been dispatched.');
    return { success: true, logs };
  } catch (error) {
    addLog(`Master Error: ${error.message}`);
    return { success: false, logs };
  }
});


// iOS PUSH GÖNDERME MANTIĞI
async function sendIosPush(profile, tokens, payload, addLog) {
  let apnProvider;
  const notificationPayload = JSON.parse(payload);

  if (profile.certType === 'p8') {
    addLog('Establishing APNs connection with .p8 certificate...');
    apnProvider = new apn.Provider({
      token: {
        key: profile.p8Path,
        keyId: profile.keyId,
        teamId: profile.teamId,
      },
      production: profile.isProduction, 
    });
  } else { // p12
    addLog('Establishing APNs connection with .p12 certificate...');
    apnProvider = new apn.Provider({
      pfx: profile.p12Path,
      passphrase: profile.p12Password,
      production: profile.isProduction,
    });
  }

  const notification = new apn.Notification();
  notification.expiry = Math.floor(Date.now() / 1000) + 3600;
  notification.badge = notificationPayload.aps.badge || 1;
  notification.sound = notificationPayload.aps.sound || 'default';
  notification.alert = notificationPayload.aps.alert;
  notification.topic = profile.bundleId; // This is very important!
  notification.payload = notificationPayload.data || {};

  addLog(`Preparing notification for topic: '${notification.topic}'`);

  const results = await apnProvider.send(notification, tokens);
  
  results.sent.forEach(token => addLog(`Successfully sent to: ${token.device}`));
  results.failed.forEach(failure => addLog(`Failed to send to: Device=${failure.device}, Reason=${failure.error?.message || failure.status}`));

  apnProvider.shutdown(); 
}

// ANDROID PUSH GÖNDERME MANTIĞI
async function sendAndroidPush(profile, tokens, payload, isDryRun, addLog) {
  const appName = profile.name; // We will use a unique name for each profile.

  // Check if a Firebase app with this name has been initialized before.
  let firebaseApp;
  if (admin.apps.some(app => app.name === appName)) {
    // If it has been initialized, use that instance.
    firebaseApp = admin.app(appName);
    addLog(`Using existing Firebase instance '${appName}'.`);
  } else {
    // If not, initialize a new one.
    addLog(`Initializing new Firebase instance for '${appName}'.`);
    try {
      const serviceAccount = require(profile.serviceAccountPath);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      }, appName); // <-- MOST IMPORTANT PART: Initializing the app with a name.
    } catch (e) {
      addLog(`ERROR: Could not read or parse the Service Account file: ${profile.serviceAccountPath}. Error: ${e.message}`);
      throw new Error('Invalid Service Account file.');
    }
  }

  const messaging = firebaseApp.messaging();
  const messagePayload = JSON.parse(payload);
  
  // Flexible payload support (as in the previous step)
  let notification;
  if (messagePayload.notification && messagePayload.notification.title && messagePayload.notification.body) {
    notification = {
      title: messagePayload.notification.title,
      body: messagePayload.notification.body,
    };
  } else if (messagePayload.title && messagePayload.message) {
    notification = {
      title: messagePayload.title,
      body: messagePayload.message,
    };
  } else {
    throw new Error('Payload must contain a valid "notification" object or "title"/"message" fields.');
  }

  const data = messagePayload.params || messagePayload.data || {};

  addLog(`Dry Run mode: ${isDryRun ? 'Enabled' : 'Disabled'}`);

  const messages = tokens.map(token => ({
    token: token,
    notification: notification,
    data: data,
    android: {
        priority: 'high'
    }
  }));

  const response = await messaging.sendEach(messages, isDryRun);

  if (response.failureCount > 0) {
    addLog(`${response.failureCount} notifications failed to send.`);
  }
  if (response.successCount > 0) {
    addLog(`${response.successCount} notifications were sent successfully.`);
  }

  response.responses.forEach((result, index) => {
    const token = tokens[index];
    if (result.success) {
      addLog(`Success: ${token} -> Message ID: ${result.messageId}`);
    } else {
      // Log the error reason more clearly
      addLog(`Error: ${token} -> ${result.error.code} (${result.error.message})`);
    }
  });
}