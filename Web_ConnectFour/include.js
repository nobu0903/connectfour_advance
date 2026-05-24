document.addEventListener("DOMContentLoaded", () => {
    // Load header partial
    fetch("/html/partials/header.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("header-container").innerHTML = data;
        })
        .catch(error => console.error("Failed to load header:", error));

     // Load footer partial
     fetch("/html/partials/footer.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("footer-container").innerHTML = data;
        })
        .catch(error => console.error("Failed to load footer:", error));
});