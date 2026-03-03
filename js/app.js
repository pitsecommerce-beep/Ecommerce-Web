/* ============================================
   REFACCIONARIA PITS - Application Logic
   ============================================ */

// ============ FIREBASE CONFIG ============
// Placeholders replaced by GitHub Actions during deploy
const firebaseConfig = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============ STATE ============
let products = [];
let filteredProducts = [];
let cart = JSON.parse(localStorage.getItem('pits_cart') || '[]');
let currentPage = 1;
const PRODUCTS_PER_PAGE = 20;
let currentModalProduct = null;
let modalQty = 1;
let isAdmin = false;
let marcas = [];
let modelos = [];
let partes = [];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function() {
    updateCartUI();
    loadProducts();
    setupNavScroll();
    setupDragDrop();

    auth.onAuthStateChanged(function(user) {
        if (user) {
            isAdmin = true;
        } else {
            isAdmin = false;
            if (document.getElementById('adminPanel').classList.contains('active')) {
                showPublicSite();
            }
        }
    });
});

// ============ NAVBAR ============
function setupNavScroll() {
    window.addEventListener('scroll', function() {
        var navbar = document.getElementById('navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function toggleMobileMenu() {
    var menu = document.getElementById('mobileMenu');
    var overlay = document.getElementById('mobileOverlay');
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
    if (overlay.style.display === 'block') {
        overlay.style.display = 'none';
    } else {
        overlay.style.display = 'block';
    }
}

// ============ PUBLIC / ADMIN TOGGLE ============
function showPublicSite() {
    document.getElementById('publicSite').style.display = 'block';
    document.getElementById('adminPanel').classList.remove('active');
    var publicLinks = document.querySelectorAll('.nav-link-public');
    publicLinks.forEach(function(el) { el.style.display = ''; });
    document.querySelector('.whatsapp-float').style.display = '';
}

function showAdminPanel() {
    document.getElementById('publicSite').style.display = 'none';
    document.getElementById('adminPanel').classList.add('active');
    var publicLinks = document.querySelectorAll('.nav-link-public');
    publicLinks.forEach(function(el) { el.style.display = 'none'; });
    document.querySelector('.whatsapp-float').style.display = 'none';
    updateAdminStats();
    renderAdminTable();
    window.scrollTo(0, 0);
}

// ============ LOAD PRODUCTS FROM FIRESTORE ============
function loadProducts() {
    db.collection('products').get().then(function(snapshot) {
        products = [];
        snapshot.forEach(function(doc) {
            var d = doc.data();
            d.id = doc.id;
            products.push(d);
        });
        populateFilters();
        // Show all products initially if there are some
        if (products.length > 0) {
            filteredProducts = products.slice();
            renderProducts();
        }
    }).catch(function(err) {
        console.log('Error loading products:', err);
    });
}

function populateFilters() {
    var marcaSet = {};
    var modeloSet = {};
    var parteSet = {};

    products.forEach(function(p) {
        if (p.marca) marcaSet[p.marca] = true;
        if (p.modelo) modeloSet[p.modelo] = true;
        if (p.parte) parteSet[p.parte] = true;
    });

    marcas = Object.keys(marcaSet).sort();
    modelos = Object.keys(modeloSet).sort();
    partes = Object.keys(parteSet).sort();

    fillSelect('marcaFilter', marcas, 'Todas las marcas');
    fillSelect('modeloFilter', modelos, 'Todos los modelos');
    fillSelect('parteFilter', partes, 'Tipo de pieza');
    fillSelect('heroMarcaFilter', marcas, 'Marca');
    fillSelect('heroParteFilter', partes, 'Tipo de Pieza');
}

function fillSelect(id, items, placeholder) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">' + placeholder + '</option>';
    items.forEach(function(item) {
        sel.innerHTML += '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>';
    });
}

// ============ SEARCH ============
function heroSearch() {
    var query = document.getElementById('heroSearchInput').value.trim();
    var marca = document.getElementById('heroMarcaFilter').value;
    var parte = document.getElementById('heroParteFilter').value;

    document.getElementById('searchInput').value = query;
    document.getElementById('marcaFilter').value = marca;
    document.getElementById('parteFilter').value = parte;
    document.getElementById('modeloFilter').value = '';

    searchProducts();

    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
}

function searchProducts() {
    var query = document.getElementById('searchInput').value.trim().toLowerCase();
    var marca = document.getElementById('marcaFilter').value;
    var modelo = document.getElementById('modeloFilter').value;
    var parte = document.getElementById('parteFilter').value;

    filteredProducts = products.filter(function(p) {
        var matchesQuery = !query ||
            (p.sku && p.sku.toLowerCase().indexOf(query) !== -1) ||
            (p.descripcion && p.descripcion.toLowerCase().indexOf(query) !== -1) ||
            (p.marca && p.marca.toLowerCase().indexOf(query) !== -1) ||
            (p.modelo && p.modelo.toLowerCase().indexOf(query) !== -1) ||
            (p.parte && p.parte.toLowerCase().indexOf(query) !== -1);

        var matchesMarca = !marca || p.marca === marca;
        var matchesModelo = !modelo || p.modelo === modelo;
        var matchesParte = !parte || p.parte === parte;

        return matchesQuery && matchesMarca && matchesModelo && matchesParte;
    });

    currentPage = 1;
    renderProducts();
}

// ============ RENDER PRODUCTS ============
function renderProducts() {
    var grid = document.getElementById('productsGrid');
    var paginationEl = document.getElementById('pagination');

    if (filteredProducts.length === 0) {
        grid.innerHTML = '<div class="products-empty"><div class="empty-icon">&#128270;</div><p>No se encontraron productos. Intenta con otra busqueda.</p></div>';
        paginationEl.innerHTML = '';
        return;
    }

    var totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
    var start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    var end = start + PRODUCTS_PER_PAGE;
    var pageProducts = filteredProducts.slice(start, end);

    var html = '';
    pageProducts.forEach(function(p) {
        var stockClass = (p.existencia && parseInt(p.existencia) > 0) ? 'in-stock' : 'out-stock';
        var stockText = (p.existencia && parseInt(p.existencia) > 0) ? 'Disponible' : 'Agotado';
        var price = typeof p.precio === 'number' ? p.precio : parseFloat(p.precio) || 0;
        var imgHtml = p.imagen_url
            ? '<img src="' + escapeHtml(p.imagen_url) + '" alt="' + escapeHtml(p.descripcion || '') + '" onerror="this.parentElement.innerHTML=\'<span class=no-img>&#128247;</span>\'">'
            : '<span class="no-img">&#128247;</span>';

        html += '<div class="product-card" onclick="openProductModal(\'' + escapeHtml(p.id) + '\')">' +
            '<div class="product-card-img">' + imgHtml + '</div>' +
            '<div class="product-card-body">' +
            '<div class="product-card-sku">' + escapeHtml(p.sku || '') + '</div>' +
            '<div class="product-card-title">' + escapeHtml(p.descripcion || 'Sin descripcion') + '</div>' +
            '<div class="product-card-meta">' + escapeHtml(p.marca || '') + ' &middot; ' + escapeHtml(p.modelo || '') + ' &middot; ' + escapeHtml(p.parte || '') + '</div>' +
            '<div class="product-card-footer">' +
            '<span class="product-card-price">$' + price.toLocaleString('es-MX', {minimumFractionDigits: 2}) + '</span>' +
            '<span class="product-card-stock ' + stockClass + '">' + stockText + '</span>' +
            '</div></div></div>';
    });

    grid.innerHTML = html;

    // Pagination
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    var pagHtml = '<button ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="goToPage(' + (currentPage - 1) + ')">&#8592;</button>';
    for (var i = 1; i <= totalPages; i++) {
        if (totalPages > 7) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                pagHtml += '<button class="' + (i === currentPage ? 'active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                pagHtml += '<button disabled>...</button>';
            }
        } else {
            pagHtml += '<button class="' + (i === currentPage ? 'active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
        }
    }
    pagHtml += '<button ' + (currentPage === totalPages ? 'disabled' : '') + ' onclick="goToPage(' + (currentPage + 1) + ')">&#8594;</button>';
    paginationEl.innerHTML = pagHtml;
}

function goToPage(page) {
    currentPage = page;
    renderProducts();
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
}

// ============ PRODUCT MODAL ============
function openProductModal(productId) {
    var p = products.find(function(item) { return item.id === productId; });
    if (!p) return;

    currentModalProduct = p;
    modalQty = 1;

    var modalImgEl = document.getElementById('modalImg');
    if (p.imagen_url) {
        modalImgEl.innerHTML = '<img src="' + escapeHtml(p.imagen_url) + '" alt="' + escapeHtml(p.descripcion || '') + '" onerror="this.parentElement.innerHTML=\'<span class=no-img>&#128247;</span>\'">';
    } else {
        modalImgEl.innerHTML = '<span class="no-img">&#128247;</span>';
    }

    document.getElementById('modalSku').textContent = p.sku || 'N/A';
    document.getElementById('modalTitle').textContent = p.descripcion || 'Sin descripcion';
    document.getElementById('modalDesc').textContent = p.descripcion || '';
    document.getElementById('modalMarca').textContent = p.marca || '-';
    document.getElementById('modalModelo').textContent = p.modelo || '-';
    document.getElementById('modalParte').textContent = p.parte || '-';

    var existencia = parseInt(p.existencia) || 0;
    document.getElementById('modalExistencia').textContent = existencia;

    var price = typeof p.precio === 'number' ? p.precio : parseFloat(p.precio) || 0;
    document.getElementById('modalPrice').textContent = '$' + price.toLocaleString('es-MX', {minimumFractionDigits: 2});

    var stockEl = document.getElementById('modalStock');
    if (existencia > 0) {
        stockEl.textContent = existencia + ' en existencia';
        stockEl.className = 'product-modal-stock in-stock';
    } else {
        stockEl.textContent = 'Sin existencia';
        stockEl.className = 'product-modal-stock out-stock';
    }

    document.getElementById('modalQty').textContent = '1';
    document.getElementById('productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    document.body.style.overflow = '';
    currentModalProduct = null;
}

function changeQty(delta) {
    modalQty = Math.max(1, modalQty + delta);
    document.getElementById('modalQty').textContent = modalQty;
}

// ============ CART ============
function addToCart() {
    if (!currentModalProduct) return;

    var existing = cart.find(function(item) { return item.sku === currentModalProduct.sku; });
    if (existing) {
        existing.qty += modalQty;
    } else {
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

    saveCart();
    updateCartUI();
    closeProductModal();
    showToast('Producto agregado al carrito', 'success');
}

function removeFromCart(sku) {
    cart = cart.filter(function(item) { return item.sku !== sku; });
    saveCart();
    updateCartUI();
    renderCartItems();
}

function updateCartItemQty(sku, delta) {
    var item = cart.find(function(i) { return i.sku === sku; });
    if (item) {
        item.qty = Math.max(1, item.qty + delta);
        saveCart();
        updateCartUI();
        renderCartItems();
    }
}

function saveCart() {
    localStorage.setItem('pits_cart', JSON.stringify(cart));
}

function updateCartUI() {
    var count = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
    document.getElementById('cartCount').textContent = count;
    var mobileCount = document.getElementById('cartCountMobile');
    if (mobileCount) mobileCount.textContent = count;
}

function toggleCart() {
    var overlay = document.getElementById('cartOverlay');
    var sidebar = document.getElementById('cartSidebar');
    var isActive = sidebar.classList.contains('active');

    if (isActive) {
        overlay.classList.remove('active');
        sidebar.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        renderCartItems();
        overlay.classList.add('active');
        sidebar.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function renderCartItems() {
    var container = document.getElementById('cartItems');
    var totalEl = document.getElementById('cartTotal');

    if (cart.length === 0) {
        container.innerHTML = '<div class="cart-empty"><div class="empty-icon">&#128722;</div><p>Tu carrito esta vacio</p></div>';
        totalEl.textContent = '$0.00';
        return;
    }

    var html = '';
    var total = 0;

    cart.forEach(function(item) {
        var subtotal = item.precio * item.qty;
        total += subtotal;

        var imgHtml = item.imagen_url
            ? '<img src="' + escapeHtml(item.imagen_url) + '" onerror="this.style.display=\'none\'">'
            : '&#128247;';

        html += '<div class="cart-item">' +
            '<div class="cart-item-img">' + imgHtml + '</div>' +
            '<div class="cart-item-details">' +
            '<div class="cart-item-name">' + escapeHtml(item.descripcion) + '</div>' +
            '<div class="cart-item-sku">SKU: ' + escapeHtml(item.sku) + '</div>' +
            '<div class="cart-item-price">$' + item.precio.toLocaleString('es-MX', {minimumFractionDigits: 2}) + '</div>' +
            '<div class="cart-item-qty">' +
            '<button onclick="updateCartItemQty(\'' + escapeHtml(item.sku) + '\', -1)">-</button>' +
            '<span>' + item.qty + '</span>' +
            '<button onclick="updateCartItemQty(\'' + escapeHtml(item.sku) + '\', 1)">+</button>' +
            '</div></div>' +
            '<button class="cart-item-remove" onclick="removeFromCart(\'' + escapeHtml(item.sku) + '\')">&#10005;</button>' +
            '</div>';
    });

    container.innerHTML = html;
    totalEl.textContent = '$' + total.toLocaleString('es-MX', {minimumFractionDigits: 2});
}

function checkoutWhatsApp() {
    if (cart.length === 0) {
        showToast('Tu carrito esta vacio', 'error');
        return;
    }

    var msg = 'Hola, quiero comprar los siguientes productos:%0A%0A';

    cart.forEach(function(item) {
        msg += '- SKU: ' + item.sku + ' | ' + item.descripcion + ' | Cant: ' + item.qty + ' | $' + (item.precio * item.qty).toFixed(2) + '%0A';
    });

    var total = cart.reduce(function(sum, item) { return sum + (item.precio * item.qty); }, 0);
    msg += '%0ATotal: $' + total.toFixed(2);

    window.open('https://wa.me/5215576818593?text=' + msg, '_blank');
}

// ============ AUTH ============
function openAuthModal() {
    if (isAdmin) {
        showAdminPanel();
        return;
    }
    document.getElementById('authModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authError').classList.remove('show');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
    document.body.style.overflow = '';
}

function signIn() {
    var email = document.getElementById('authEmail').value.trim();
    var password = document.getElementById('authPassword').value;
    var errorEl = document.getElementById('authError');

    if (!email || !password) {
        errorEl.textContent = 'Ingresa correo y contrasena';
        errorEl.classList.add('show');
        return;
    }

    errorEl.classList.remove('show');

    auth.signInWithEmailAndPassword(email, password).then(function() {
        isAdmin = true;
        closeAuthModal();
        showAdminPanel();
        showToast('Sesion iniciada correctamente', 'success');
    }).catch(function(err) {
        var message = 'Error al iniciar sesion';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            message = 'Correo o contrasena incorrectos';
        } else if (err.code === 'auth/too-many-requests') {
            message = 'Demasiados intentos. Intenta mas tarde.';
        }
        errorEl.textContent = message;
        errorEl.classList.add('show');
    });
}

function signOut() {
    auth.signOut().then(function() {
        isAdmin = false;
        showPublicSite();
        showToast('Sesion cerrada', 'success');
    });
}

// ============ ADMIN: EXCEL DOWNLOAD TEMPLATE ============
function downloadTemplate() {
    var headers = ['sku', 'descripcion', 'marca', 'modelo', 'parte', 'precio', 'existencia', 'imagen_url'];
    var example = ['SKU-001', 'Faro delantero derecho', 'Toyota', 'Corolla 2020', 'Faro', '1250.00', '15', 'https://ejemplo.com/imagen.jpg'];

    var ws = XLSX.utils.aoa_to_sheet([headers, example]);

    // Set column widths
    ws['!cols'] = [
        {wch: 12}, {wch: 30}, {wch: 15}, {wch: 20}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 40}
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'plantilla_productos_pits.xlsx');
    showToast('Plantilla descargada', 'success');
}

// ============ ADMIN: EXCEL UPLOAD ============
function setupDragDrop() {
    var zone = document.getElementById('uploadZone');
    if (!zone) return;

    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', function() {
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var files = e.dataTransfer.files;
        if (files.length > 0) {
            processExcelFile(files[0]);
        }
    });
}

function handleExcelUpload(event) {
    var file = event.target.files[0];
    if (file) {
        processExcelFile(file);
    }
    event.target.value = '';
}

function processExcelFile(file) {
    var statusEl = document.getElementById('uploadStatus');

    if (!file.name.match(/\.xlsx?$/i)) {
        statusEl.className = 'upload-status error';
        statusEl.textContent = 'Solo se aceptan archivos .xlsx o .xls';
        return;
    }

    statusEl.className = 'upload-status success';
    statusEl.textContent = 'Procesando archivo...';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (rows.length === 0) {
                statusEl.className = 'upload-status error';
                statusEl.textContent = 'El archivo esta vacio';
                return;
            }

            statusEl.textContent = 'Subiendo ' + rows.length + ' productos a la base de datos...';

            var batch = db.batch();
            var count = 0;
            var batchPromises = [];

            rows.forEach(function(row) {
                var sku = String(row.sku || row.SKU || '').trim();
                if (!sku) return;

                var productData = {
                    sku: sku,
                    descripcion: String(row.descripcion || row.Descripcion || row.DESCRIPCION || '').trim(),
                    marca: String(row.marca || row.Marca || row.MARCA || '').trim(),
                    modelo: String(row.modelo || row.Modelo || row.MODELO || '').trim(),
                    parte: String(row.parte || row.Parte || row.PARTE || '').trim(),
                    precio: parseFloat(row.precio || row.Precio || row.PRECIO || 0) || 0,
                    existencia: parseInt(row.existencia || row.Existencia || row.EXISTENCIA || 0) || 0,
                    imagen_url: String(row.imagen_url || row.Imagen_url || row.IMAGEN_URL || row.imagen || '').trim(),
                    updated_at: firebase.firestore.FieldValue.serverTimestamp()
                };

                var docRef = db.collection('products').doc(sku);
                batch.set(docRef, productData, { merge: true });
                count++;

                // Firestore batches limited to 500
                if (count % 450 === 0) {
                    batchPromises.push(batch.commit());
                    batch = db.batch();
                }
            });

            if (count % 450 !== 0) {
                batchPromises.push(batch.commit());
            }

            Promise.all(batchPromises).then(function() {
                statusEl.className = 'upload-status success';
                statusEl.textContent = 'Se cargaron ' + count + ' productos exitosamente';
                showToast(count + ' productos cargados', 'success');
                loadProducts();
                setTimeout(function() {
                    updateAdminStats();
                    renderAdminTable();
                }, 1000);
            }).catch(function(err) {
                statusEl.className = 'upload-status error';
                statusEl.textContent = 'Error al guardar: ' + err.message;
                console.error(err);
            });

        } catch (err) {
            statusEl.className = 'upload-status error';
            statusEl.textContent = 'Error al leer el archivo: ' + err.message;
            console.error(err);
        }
    };

    reader.readAsArrayBuffer(file);
}

// ============ ADMIN: STATS & TABLE ============
function updateAdminStats() {
    document.getElementById('totalProducts').textContent = products.length;

    var brandsSet = {};
    var inStock = 0;
    products.forEach(function(p) {
        if (p.marca) brandsSet[p.marca] = true;
        if (parseInt(p.existencia) > 0) inStock++;
    });

    document.getElementById('totalBrands').textContent = Object.keys(brandsSet).length;
    document.getElementById('totalInStock').textContent = inStock;
}

function renderAdminTable() {
    var tbody = document.getElementById('adminProductsBody');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-light);">No hay productos cargados</td></tr>';
        return;
    }

    // Show first 100 in table
    var display = products.slice(0, 100);
    var html = '';

    display.forEach(function(p) {
        var price = typeof p.precio === 'number' ? p.precio : parseFloat(p.precio) || 0;
        html += '<tr>' +
            '<td><strong>' + escapeHtml(p.sku || '') + '</strong></td>' +
            '<td>' + escapeHtml((p.descripcion || '').substring(0, 40)) + '</td>' +
            '<td>' + escapeHtml(p.marca || '') + '</td>' +
            '<td>' + escapeHtml(p.modelo || '') + '</td>' +
            '<td>' + escapeHtml(p.parte || '') + '</td>' +
            '<td>$' + price.toLocaleString('es-MX', {minimumFractionDigits: 2}) + '</td>' +
            '<td>' + (p.existencia || 0) + '</td>' +
            '<td><button class="admin-delete-btn" onclick="deleteProduct(\'' + escapeHtml(p.id || p.sku) + '\')" title="Eliminar">&#128465;</button></td>' +
            '</tr>';
    });

    if (products.length > 100) {
        html += '<tr><td colspan="8" style="text-align:center; padding: 16px; color: var(--text-light);">Mostrando 100 de ' + products.length + ' productos</td></tr>';
    }

    tbody.innerHTML = html;
}

function deleteProduct(productId) {
    if (!confirm('Eliminar este producto?')) return;

    db.collection('products').doc(productId).delete().then(function() {
        products = products.filter(function(p) { return p.id !== productId; });
        updateAdminStats();
        renderAdminTable();
        populateFilters();
        showToast('Producto eliminado', 'success');
    }).catch(function(err) {
        showToast('Error al eliminar: ' + err.message, 'error');
    });
}

// ============ TOAST ============
function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s';
        setTimeout(function() {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 300);
    }, 3000);
}

// ============ UTILS ============
function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Close modals with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeProductModal();
        closeAuthModal();
        if (document.getElementById('cartSidebar').classList.contains('active')) {
            toggleCart();
        }
    }
});

// Close product modal clicking overlay
document.getElementById('productModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeProductModal();
    }
});

// Close auth modal clicking overlay
document.getElementById('authModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAuthModal();
    }
});
