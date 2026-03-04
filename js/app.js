/* ==============================================
   REFACCIONARIA PITS — App Logic
   ============================================== */

// Firebase Config (replaced by GitHub Actions)
var firebaseConfig = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__"
};
firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();

// State
var products = [];
var filteredProducts = [];
var cart = JSON.parse(localStorage.getItem('pits_cart') || '[]');
var currentPage = 1;
var PER_PAGE = 20;
var currentModalProduct = null;
var modalQty = 1;
var isAdmin = false;

// SVG templates for reuse in JS-rendered HTML
var SVG = {
    image: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    cart: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    x: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    trash: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    eye: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
};

// Init
document.addEventListener('DOMContentLoaded', function () {
    updateCartCount();
    loadProducts();
    setupScroll();
    setupDragDrop();

    auth.onAuthStateChanged(function (user) {
        isAdmin = !!user;
        if (!user && document.getElementById('adminPanel').classList.contains('open')) {
            showPublicSite();
        }
    });
});

// ---- Nav scroll ----
function setupScroll() {
    var nav = document.getElementById('nav');
    window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
}

// ---- Mobile menu ----
function toggleMobile() {
    var bg = document.getElementById('mobBg');
    var drawer = document.getElementById('mobDrawer');
    var open = drawer.classList.contains('open');
    bg.classList.toggle('open', !open);
    drawer.classList.toggle('open', !open);
}

// ---- Public / Admin toggle ----
function showPublicSite() {
    document.getElementById('publicSite').style.display = '';
    document.getElementById('adminPanel').classList.remove('open');
    togglePubLinks(true);
}

function showAdminPanel() {
    document.getElementById('publicSite').style.display = 'none';
    document.getElementById('adminPanel').classList.add('open');
    togglePubLinks(false);
    updateAdminStats();
    renderAdminTable();
    window.scrollTo(0, 0);
}

function togglePubLinks(show) {
    document.querySelectorAll('.pub-link').forEach(function (el) {
        el.style.display = show ? '' : 'none';
    });
}

// ---- Products ----
function loadProducts() {
    db.collection('products').get().then(function (snap) {
        products = [];
        snap.forEach(function (doc) { var d = doc.data(); d.id = doc.id; products.push(d); });
        populateFilters();
        if (products.length) { filteredProducts = products.slice(); renderProducts(); }
    }).catch(function (e) { console.log('Load error:', e); });
}

function populateFilters() {
    var m = {}, mo = {}, p = {};
    products.forEach(function (pr) {
        if (pr.marca) m[pr.marca] = 1;
        if (pr.modelo) mo[pr.modelo] = 1;
        if (pr.parte) p[pr.parte] = 1;
    });
    var marcas = Object.keys(m).sort(), modelos = Object.keys(mo).sort(), partes = Object.keys(p).sort();
    fill('marcaFilter', marcas, 'Todas las marcas');
    fill('modeloFilter', modelos, 'Todos los modelos');
    fill('parteFilter', partes, 'Tipo de pieza');
    fill('heroMarcaFilter', marcas, 'Marca');
    fill('heroParteFilter', partes, 'Tipo de pieza');
}

function fill(id, items, ph) {
    var s = document.getElementById(id);
    if (!s) return;
    var h = '<option value="">' + ph + '</option>';
    items.forEach(function (i) { h += '<option value="' + esc(i) + '">' + esc(i) + '</option>'; });
    s.innerHTML = h;
}

// ---- Search ----
function heroSearch() {
    document.getElementById('searchInput').value = document.getElementById('heroSearchInput').value;
    document.getElementById('marcaFilter').value = document.getElementById('heroMarcaFilter').value;
    document.getElementById('parteFilter').value = document.getElementById('heroParteFilter').value;
    document.getElementById('modeloFilter').value = '';
    searchProducts();
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
}

function searchProducts() {
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    var marca = document.getElementById('marcaFilter').value;
    var modelo = document.getElementById('modeloFilter').value;
    var parte = document.getElementById('parteFilter').value;

    filteredProducts = products.filter(function (p) {
        var mq = !q ||
            (p.sku && p.sku.toLowerCase().indexOf(q) !== -1) ||
            (p.descripcion && p.descripcion.toLowerCase().indexOf(q) !== -1) ||
            (p.marca && p.marca.toLowerCase().indexOf(q) !== -1) ||
            (p.modelo && p.modelo.toLowerCase().indexOf(q) !== -1) ||
            (p.parte && p.parte.toLowerCase().indexOf(q) !== -1);
        return mq && (!marca || p.marca === marca) && (!modelo || p.modelo === modelo) && (!parte || p.parte === parte);
    });
    currentPage = 1;
    renderProducts();
}

// ---- Render products ----
function renderProducts() {
    var grid = document.getElementById('productsGrid');
    var pag = document.getElementById('pagination');
    var rc = document.getElementById('resultsCount');

    if (!filteredProducts.length) {
        grid.innerHTML = '<div class="pgrid-empty">' + SVG.search + '<p>No se encontraron productos. Intenta con otra b&uacute;squeda.</p></div>';
        pag.innerHTML = '';
        rc.textContent = '';
        return;
    }

    rc.textContent = filteredProducts.length + ' resultado' + (filteredProducts.length !== 1 ? 's' : '');

    var pages = Math.ceil(filteredProducts.length / PER_PAGE);
    var start = (currentPage - 1) * PER_PAGE;
    var slice = filteredProducts.slice(start, start + PER_PAGE);
    var h = '';

    slice.forEach(function (p) {
        var inStock = p.existencia && parseInt(p.existencia) > 0;
        var price = parseFloat(p.precio) || 0;
        var img = p.imagen_url
            ? '<img src="' + esc(p.imagen_url) + '" alt="' + esc(p.descripcion || '') + '" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=noimg>' + SVG.image + '</div>\'">'
            : '<div class="noimg">' + SVG.image + '</div>';

        h += '<div class="pcard" onclick="openProductModal(\'' + esc(p.id) + '\')">' +
            '<div class="pcard-img">' + img +
            '<div class="pcard-over"><span>' + SVG.eye + ' Ver detalle</span></div></div>' +
            '<div class="pcard-body">' +
            '<div class="pcard-sku">' + esc(p.sku || '') + '</div>' +
            '<div class="pcard-name">' + esc(p.descripcion || 'Sin descripci\u00f3n') + '</div>' +
            '<div class="pcard-meta">' + esc(p.marca || '') + ' &middot; ' + esc(p.modelo || '') + ' &middot; ' + esc(p.parte || '') + '</div>' +
            '<div class="pcard-foot">' +
            '<span class="pcard-price">$' + price.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + '</span>' +
            '<span class="pcard-stock ' + (inStock ? 'in' : 'out') + '">' + (inStock ? 'Disponible' : 'Agotado') + '</span>' +
            '</div></div></div>';
    });
    grid.innerHTML = h;

    // Pagination
    if (pages <= 1) { pag.innerHTML = ''; return; }
    var ph = '<button ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="goPage(' + (currentPage - 1) + ')">&larr;</button>';
    for (var i = 1; i <= pages; i++) {
        if (pages > 7) {
            if (i === 1 || i === pages || (i >= currentPage - 1 && i <= currentPage + 1))
                ph += '<button class="' + (i === currentPage ? 'cur' : '') + '" onclick="goPage(' + i + ')">' + i + '</button>';
            else if (i === currentPage - 2 || i === currentPage + 2)
                ph += '<button disabled>&hellip;</button>';
        } else {
            ph += '<button class="' + (i === currentPage ? 'cur' : '') + '" onclick="goPage(' + i + ')">' + i + '</button>';
        }
    }
    ph += '<button ' + (currentPage === pages ? 'disabled' : '') + ' onclick="goPage(' + (currentPage + 1) + ')">&rarr;</button>';
    pag.innerHTML = ph;
}

function goPage(n) {
    currentPage = n;
    renderProducts();
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
}

// ---- Product Modal ----
function openProductModal(id) {
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    currentModalProduct = p;
    modalQty = 1;

    var imgEl = document.getElementById('modalImg');
    imgEl.innerHTML = p.imagen_url
        ? '<img src="' + esc(p.imagen_url) + '" alt="' + esc(p.descripcion || '') + '" onerror="this.parentElement.innerHTML=\'<div class=noimg>' + SVG.image.replace(/'/g, "\\'") + '</div>\'">'
        : '<div class="noimg">' + SVG.image + '</div>';

    document.getElementById('modalSku').textContent = p.sku || 'N/A';
    document.getElementById('modalTitle').textContent = p.descripcion || 'Sin descripci\u00f3n';
    document.getElementById('modalDesc').textContent = p.descripcion || '';
    document.getElementById('modalMarca').textContent = p.marca || '-';
    document.getElementById('modalModelo').textContent = p.modelo || '-';
    document.getElementById('modalParte').textContent = p.parte || '-';

    var ex = parseInt(p.existencia) || 0;
    document.getElementById('modalExistencia').textContent = ex;
    var price = parseFloat(p.precio) || 0;
    document.getElementById('modalPrice').textContent = '$' + price.toLocaleString('es-MX', { minimumFractionDigits: 2 });

    var stockEl = document.getElementById('modalStock');
    stockEl.textContent = ex > 0 ? ex + ' en existencia' : 'Sin existencia';
    stockEl.className = 'pm-stock ' + (ex > 0 ? 'in' : 'out');

    document.getElementById('modalQty').textContent = '1';
    document.getElementById('productModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('open');
    document.body.style.overflow = '';
    currentModalProduct = null;
}

function changeQty(d) {
    modalQty = Math.max(1, modalQty + d);
    document.getElementById('modalQty').textContent = modalQty;
}

// ---- Cart ----
function addToCart() {
    if (!currentModalProduct) return;
    var ex = cart.find(function (i) { return i.sku === currentModalProduct.sku; });
    if (ex) { ex.qty += modalQty; }
    else {
        cart.push({
            sku: currentModalProduct.sku,
            descripcion: currentModalProduct.descripcion || '',
            marca: currentModalProduct.marca || '',
            modelo: currentModalProduct.modelo || '',
            precio: parseFloat(currentModalProduct.precio) || 0,
            imagen_url: currentModalProduct.imagen_url || '',
            qty: modalQty
        });
    }
    saveCart(); updateCartCount(); closeProductModal();
    toast('Producto agregado al carrito', 'ok');
}

function removeFromCart(sku) {
    cart = cart.filter(function (i) { return i.sku !== sku; });
    saveCart(); updateCartCount(); renderCartItems();
}

function updateCartItemQty(sku, d) {
    var it = cart.find(function (i) { return i.sku === sku; });
    if (it) { it.qty = Math.max(1, it.qty + d); saveCart(); updateCartCount(); renderCartItems(); }
}

function saveCart() { localStorage.setItem('pits_cart', JSON.stringify(cart)); }

function updateCartCount() {
    var c = cart.reduce(function (s, i) { return s + i.qty; }, 0);
    document.getElementById('cartCount').textContent = c;
    var m = document.getElementById('cartCountMob');
    if (m) m.textContent = c;
}

function toggleCart() {
    var bg = document.getElementById('cartBg');
    var panel = document.getElementById('cartPanel');
    var open = panel.classList.contains('open');
    if (open) { bg.classList.remove('open'); panel.classList.remove('open'); document.body.style.overflow = ''; }
    else { renderCartItems(); bg.classList.add('open'); panel.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function renderCartItems() {
    var c = document.getElementById('cartItems');
    var t = document.getElementById('cartTotal');
    if (!cart.length) {
        c.innerHTML = '<div class="cart-empty-msg">' + SVG.cart + '<p>Tu carrito est\u00e1 vac\u00edo</p></div>';
        t.textContent = '$0.00';
        return;
    }
    var h = '', total = 0;
    cart.forEach(function (it) {
        total += it.precio * it.qty;
        var img = it.imagen_url ? '<img src="' + esc(it.imagen_url) + '" onerror="this.style.display=\'none\'">' : '';
        h += '<div class="ci">' +
            '<div class="ci-img">' + img + '</div>' +
            '<div class="ci-info">' +
            '<div class="ci-name">' + esc(it.descripcion) + '</div>' +
            '<div class="ci-sku">SKU: ' + esc(it.sku) + '</div>' +
            '<div class="ci-price">$' + it.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + '</div>' +
            '<div class="ci-qty"><button onclick="updateCartItemQty(\'' + esc(it.sku) + '\',-1)">-</button><span>' + it.qty + '</span><button onclick="updateCartItemQty(\'' + esc(it.sku) + '\',1)">+</button></div>' +
            '</div>' +
            '<button class="ci-rm" onclick="removeFromCart(\'' + esc(it.sku) + '\')">' + SVG.x + '</button></div>';
    });
    c.innerHTML = h;
    t.textContent = '$' + total.toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

function checkoutWhatsApp() {
    if (!cart.length) { toast('Tu carrito est\u00e1 vac\u00edo', 'err'); return; }
    var msg = 'Hola, quiero comprar los siguientes productos:%0A%0A';
    cart.forEach(function (i) {
        msg += '- SKU: ' + i.sku + ' | ' + i.descripcion + ' | Cant: ' + i.qty + ' | $' + (i.precio * i.qty).toFixed(2) + '%0A';
    });
    var total = cart.reduce(function (s, i) { return s + i.precio * i.qty; }, 0);
    msg += '%0ATotal: $' + total.toFixed(2);
    window.open('https://wa.me/5215576818593?text=' + msg, '_blank');
}

// ---- Auth ----
function openAuthModal() {
    if (isAdmin) { showAdminPanel(); return; }
    document.getElementById('authModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authError').classList.remove('vis');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
    document.body.style.overflow = '';
}

function signIn() {
    var email = document.getElementById('authEmail').value.trim();
    var pw = document.getElementById('authPassword').value;
    var err = document.getElementById('authError');
    if (!email || !pw) { err.textContent = 'Ingresa correo y contrase\u00f1a'; err.classList.add('vis'); return; }
    err.classList.remove('vis');
    auth.signInWithEmailAndPassword(email, pw).then(function () {
        isAdmin = true; closeAuthModal(); showAdminPanel(); toast('Sesi\u00f3n iniciada', 'ok');
    }).catch(function (e) {
        var m = 'Error al iniciar sesi\u00f3n';
        if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') m = 'Correo o contrase\u00f1a incorrectos';
        else if (e.code === 'auth/too-many-requests') m = 'Demasiados intentos. Intenta m\u00e1s tarde.';
        err.textContent = m; err.classList.add('vis');
    });
}

function signOut() {
    auth.signOut().then(function () { isAdmin = false; showPublicSite(); toast('Sesi\u00f3n cerrada', 'ok'); });
}

// ---- Admin: Excel Template ----
function downloadTemplate() {
    var ws = XLSX.utils.aoa_to_sheet([
        ['sku', 'descripcion', 'marca', 'modelo', 'parte', 'precio', 'existencia', 'imagen_url'],
        ['SKU-001', 'Faro delantero derecho', 'Toyota', 'Corolla 2020', 'Faro', '1250.00', '15', 'https://ejemplo.com/imagen.jpg']
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 40 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'plantilla_productos_pits.xlsx');
    toast('Plantilla descargada', 'ok');
}

// ---- Admin: Excel Upload ----
function setupDragDrop() {
    var z = document.getElementById('uploadZone');
    if (!z) return;
    z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', function () { z.classList.remove('over'); });
    z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer.files.length) processExcel(e.dataTransfer.files[0]); });
}

function handleExcelUpload(e) { if (e.target.files[0]) processExcel(e.target.files[0]); e.target.value = ''; }

function processExcel(file) {
    var st = document.getElementById('uploadStatus');
    if (!file.name.match(/\.xlsx?$/i)) { st.className = 'upload-msg err'; st.textContent = 'Solo archivos .xlsx o .xls'; return; }
    st.className = 'upload-msg ok'; st.textContent = 'Procesando...';

    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            if (!rows.length) { st.className = 'upload-msg err'; st.textContent = 'Archivo vac\u00edo'; return; }
            st.textContent = 'Subiendo ' + rows.length + ' productos...';

            var batch = db.batch(), count = 0, promises = [];
            rows.forEach(function (r) {
                var sku = String(r.sku || r.SKU || '').trim();
                if (!sku) return;
                var data = {
                    sku: sku,
                    descripcion: String(r.descripcion || r.Descripcion || r.DESCRIPCION || '').trim(),
                    marca: String(r.marca || r.Marca || r.MARCA || '').trim(),
                    modelo: String(r.modelo || r.Modelo || r.MODELO || '').trim(),
                    parte: String(r.parte || r.Parte || r.PARTE || '').trim(),
                    precio: parseFloat(r.precio || r.Precio || r.PRECIO || 0) || 0,
                    existencia: parseInt(r.existencia || r.Existencia || r.EXISTENCIA || 0) || 0,
                    imagen_url: String(r.imagen_url || r.Imagen_url || r.IMAGEN_URL || r.imagen || '').trim(),
                    updated_at: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(db.collection('products').doc(sku), data, { merge: true });
                count++;
                if (count % 450 === 0) { promises.push(batch.commit()); batch = db.batch(); }
            });
            if (count % 450 !== 0) promises.push(batch.commit());

            Promise.all(promises).then(function () {
                st.className = 'upload-msg ok'; st.textContent = count + ' productos cargados';
                toast(count + ' productos cargados', 'ok');
                loadProducts();
                setTimeout(function () { updateAdminStats(); renderAdminTable(); }, 1000);
            }).catch(function (err) { st.className = 'upload-msg err'; st.textContent = 'Error: ' + err.message; });
        } catch (err) { st.className = 'upload-msg err'; st.textContent = 'Error al leer: ' + err.message; }
    };
    reader.readAsArrayBuffer(file);
}

// ---- Admin: Stats & Table ----
function updateAdminStats() {
    document.getElementById('totalProducts').textContent = products.length;
    var brands = {}, inStock = 0;
    products.forEach(function (p) { if (p.marca) brands[p.marca] = 1; if (parseInt(p.existencia) > 0) inStock++; });
    document.getElementById('totalBrands').textContent = Object.keys(brands).length;
    document.getElementById('totalInStock').textContent = inStock;
}

function renderAdminTable() {
    var tb = document.getElementById('adminProductsBody');
    if (!products.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--c-text-3)">No hay productos cargados</td></tr>'; return; }
    var show = products.slice(0, 100), h = '';
    show.forEach(function (p) {
        var pr = parseFloat(p.precio) || 0;
        h += '<tr><td><strong>' + esc(p.sku || '') + '</strong></td>' +
            '<td>' + esc((p.descripcion || '').substring(0, 40)) + '</td>' +
            '<td>' + esc(p.marca || '') + '</td><td>' + esc(p.modelo || '') + '</td>' +
            '<td>' + esc(p.parte || '') + '</td>' +
            '<td>$' + pr.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + '</td>' +
            '<td>' + (p.existencia || 0) + '</td>' +
            '<td><button class="del-btn" onclick="deleteProduct(\'' + esc(p.id || p.sku) + '\')">' + SVG.trash + '</button></td></tr>';
    });
    if (products.length > 100) h += '<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--c-text-3)">Mostrando 100 de ' + products.length + '</td></tr>';
    tb.innerHTML = h;
}

function deleteProduct(id) {
    if (!confirm('\u00bfEliminar este producto?')) return;
    db.collection('products').doc(id).delete().then(function () {
        products = products.filter(function (p) { return p.id !== id; });
        updateAdminStats(); renderAdminTable(); populateFilters();
        toast('Producto eliminado', 'ok');
    }).catch(function (e) { toast('Error: ' + e.message, 'err'); });
}

// ---- Toast ----
function toast(msg, type) {
    var wrap = document.getElementById('toastWrap');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
        el.style.opacity = '0'; el.style.transform = 'translateX(32px)'; el.style.transition = 'all .3s';
        setTimeout(function () { if (el.parentElement) el.parentElement.removeChild(el); }, 300);
    }, 3000);
}

// ---- Util ----
function esc(s) {
    if (!s) return '';
    var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

// ---- Keyboard & overlay close ----
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeProductModal(); closeAuthModal();
        if (document.getElementById('cartPanel').classList.contains('open')) toggleCart();
    }
});
document.getElementById('productModal').addEventListener('click', function (e) { if (e.target === this) closeProductModal(); });
document.getElementById('authModal').addEventListener('click', function (e) { if (e.target === this) closeAuthModal(); });
