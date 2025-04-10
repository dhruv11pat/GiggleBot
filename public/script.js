const container=document.querySelector('.container');
const registerBtn=document.querySelector('.register-btn');
const loginBtn=document.querySelector('.login-btn');

registerBtn.addEventListener('click',()=>{
  container.classList.add('active');
});

loginBtn.addEventListener('click',()=>{
    container.classList.remove('active');
  });



function startApp() {
        const screen = document.getElementById('welcomeScreen');
        screen.style.animation = 'slideUp 1s ease forwards';
        setTimeout(() => {
            screen.style.display = 'none';
        }, 1000);
    }