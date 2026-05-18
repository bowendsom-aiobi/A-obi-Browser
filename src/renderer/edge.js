'use strict';

const chev = document.getElementById('chev');

document.body.addEventListener('pointerenter', () => document.body.classList.add('show'));
document.body.addEventListener('pointerleave', () => document.body.classList.remove('show'));

chev.addEventListener('click', () => window.panel.openSidebar());
