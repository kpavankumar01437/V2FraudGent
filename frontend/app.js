document.querySelectorAll('nav a').forEach(link=>{link.addEventListener('click',event=>{document.querySelectorAll('nav a').forEach(item=>item.classList.remove('active'));event.currentTarget.classList.add('active')})});

document.querySelector('.primary-btn')?.addEventListener('click',()=>{alert('Review queue will connect to the V2FraudGent API in the next integration stage.')});