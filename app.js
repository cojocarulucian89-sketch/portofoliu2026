const testArray = [1, 2, 3];

function testFn() {
  const sum = testArray.reduce((s, x) => s + x, 0);
  console.log("Sum =", sum);
}

window.addEventListener("load", () => {
  testFn();
});
