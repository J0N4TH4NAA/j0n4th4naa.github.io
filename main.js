window.onload = () => {
 
  document.body.classList.remove("container");

  const flowerScene = document.getElementById("flowerScene");
  const greetingScene = document.getElementById("greetingScene");
  const FLOWER_DISPLAY_TIME = 8000;

  setTimeout(() => {
    flowerScene.classList.remove("active");
    greetingScene.classList.add("active");
  }, FLOWER_DISPLAY_TIME);
};