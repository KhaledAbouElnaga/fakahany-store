export const MIN_ACCOUNT_PASSWORD_LENGTH=8;

const ACCOUNT_PASSWORD_SYMBOL=/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/;

export function passwordRequirements(password:string){
  return [
    {id:'length',label:`8 أحرف على الأقل`,met:password.length>=MIN_ACCOUNT_PASSWORD_LENGTH},
    {id:'uppercase',label:'حرف إنجليزي كبير (A-Z)',met:/[A-Z]/.test(password)},
    {id:'lowercase',label:'حرف إنجليزي صغير (a-z)',met:/[a-z]/.test(password)},
    {id:'digit',label:'رقم واحد على الأقل (0-9)',met:/[0-9]/.test(password)},
    {id:'symbol',label:'رمز خاص مثل @ أو #',met:ACCOUNT_PASSWORD_SYMBOL.test(password)}
  ];
}

export function validateStrongPassword(password:string){
  const missing=passwordRequirements(password).filter(rule=>!rule.met);
  if(missing.length)throw new Error('كلمة المرور تحتاج: '+missing.map(rule=>rule.label).join('، ')+'.');
}
