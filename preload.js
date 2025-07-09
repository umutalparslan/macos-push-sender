const { contextBridge, ipcRenderer } = require('electron');

// Arayüze (Renderer) güvenli bir şekilde sunacağımız fonksiyonları tanımlıyoruz.
// Bu fonksiyonlar, arayüzden main.js'teki ilgili 'handle' fonksiyonlarını çağırır.
contextBridge.exposeInMainWorld('api', {
  getAppVersions: () => ipcRenderer.invoke('get-app-versions'),
  // Dosya seçme diyaloğunu tetikler
  openFileDialog: (filter) => ipcRenderer.invoke('dialog:openFile', filter),
  
  // Push gönderme işlemini tetikler
  sendPush: (args) => ipcRenderer.invoke('send:push', args),
  
  // Kayıtlı profilleri getirir
  getProfiles: () => ipcRenderer.invoke('store:getProfiles'),

  // Yeni bir profil kaydeder
  saveProfile: (profile) => ipcRenderer.invoke('store:saveProfile', profile),

  // Bir profili siler
  deleteProfile: (profileName) => ipcRenderer.invoke('store:deleteProfile', profileName),
});