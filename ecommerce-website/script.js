// Get all products
const products = document.querySelectorAll('.product');

// Add event listener to each product
products.forEach(product => {
    product.addEventListener('click', () => {
        // Get product details
        const productDetails = product.querySelector('.product-details');
        if (productDetails) {
            // Toggle product details
            productDetails.classList.toggle('show');
        }
    });
});

// Add event listener to shop now button
const shopNowButton = document.querySelector('.hero button');
shopNowButton.addEventListener('click', () => {
    // Scroll to products section
    const productsSection = document.querySelector('.products');
    productsSection.scrollIntoView({ behavior: 'smooth' });
});