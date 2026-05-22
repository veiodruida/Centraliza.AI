async function test() {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1000);
    try {
        const response = await fetch('http://google.com', { signal: controller.signal });
        console.log("Fetch success");
        if (response.body) {
            console.log("response.body constructor:", response.body.constructor.name);
            console.log("is response.body.on defined?", typeof response.body.on === 'function');
        }
    } catch (e) {
        console.log("Fetch error:", e.name, e.message);
    }
}
test();
