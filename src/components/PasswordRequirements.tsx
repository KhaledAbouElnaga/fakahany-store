import { passwordRequirements } from '../lib/passwordPolicy';

export default function PasswordRequirements({password}:{password:string}){
  return <div className="password-requirements" aria-label="شروط كلمة المرور">
    <span>شروط كلمة المرور الجديدة:</span>
    <ul>
      {passwordRequirements(password).map(rule=><li key={rule.id} className={rule.met?'satisfied':'pending'}>
        <span aria-hidden="true">{rule.met?'✓':'○'}</span>{rule.label}
      </li>)}
    </ul>
  </div>;
}
