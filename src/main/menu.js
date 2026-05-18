'use strict';

const { app, Menu } = require('electron');

function buildAppMenu(actions, t) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: t('m_file'),
      submenu: [
        { label: t('newtab'), accelerator: 'CmdOrCtrl+T', click: actions.newTab },
        { label: t('close'), accelerator: 'CmdOrCtrl+W', click: actions.closeTab },
        { label: t('m_reopen'), accelerator: 'CmdOrCtrl+Shift+T', click: actions.reopenTab },
        { type: 'separator' },
        { label: t('address_ph'), accelerator: 'CmdOrCtrl+L', click: actions.focusAddress },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: t('m_quit') }]),
      ],
    },
    {
      label: t('m_edit'),
      submenu: [
        { role: 'undo', label: t('m_undo') },
        { role: 'redo', label: t('m_redo') },
        { type: 'separator' },
        { role: 'cut', label: t('m_cut') },
        { role: 'copy', label: t('m_copy') },
        { role: 'paste', label: t('m_paste') },
        { role: 'selectAll', label: t('m_selectall') },
        { type: 'separator' },
        { label: t('m_find'), accelerator: 'CmdOrCtrl+F', click: actions.find },
      ],
    },
    {
      label: t('m_view'),
      submenu: [
        { label: t('m_sidebar'), accelerator: 'CmdOrCtrl+B', click: actions.toggleSidebar },
        { label: t('reload'), accelerator: 'CmdOrCtrl+R', click: actions.reload },
        { type: 'separator' },
        { label: t('m_zoomin'), accelerator: 'CmdOrCtrl+Plus', click: actions.zoomIn },
        { label: t('m_zoomin'), accelerator: 'CmdOrCtrl+=', click: actions.zoomIn, visible: false },
        { label: t('m_zoomout'), accelerator: 'CmdOrCtrl+-', click: actions.zoomOut },
        { label: t('m_zoomreset'), accelerator: 'CmdOrCtrl+0', click: actions.zoomReset },
        { type: 'separator' },
        {
          label: t('m_devtools'),
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: actions.toggleDevTools,
        },
      ],
    },
    {
      label: t('m_history'),
      submenu: [
        { label: t('back'), accelerator: 'CmdOrCtrl+[', click: actions.back },
        { label: t('forward'), accelerator: 'CmdOrCtrl+]', click: actions.forward },
        { type: 'separator' },
        { label: t('history'), click: () => actions.openInternal('history') },
        { label: t('downloads'), click: () => actions.openInternal('downloads') },
      ],
    },
    {
      label: t('m_window'),
      submenu: [
        { role: 'minimize', label: t('m_minimize') },
        { role: 'zoom', label: t('m_zoomreset') },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close', label: t('close') }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
