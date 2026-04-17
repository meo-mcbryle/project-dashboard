<script>
    function showYear(yearId) {
        // Hide all tables first
        const contents = document.getElementsByClassName('year-content');
        for (let i = 0; i < contents.length; i++) {
            contents[i].style.display = 'none';
        }

        // Show the specific year clicked
        document.getElementById(yearId).style.display = 'block';
    }

    // Optional: Show the latest year by default on page load
    window.onload = function() {
        showYear('2024'); 
    };
</script>