export function randomizePassword(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    
    let password = '';
    
    password += letters.charAt(Math.floor(Math.random() * 26));
    
    for (let i = 0; i < 6; i++) {
        password += letters.charAt(Math.floor(Math.random() * 26) + 26);
    }
    
    for (let i = 0; i < 4; i++) {
        password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    password += '_';
    
    return password;
}