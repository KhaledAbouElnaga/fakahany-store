import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logClientError } from '../lib/errorLogger';

export default class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('Application error',error,info);void logClientError(new Error(`${error.message} @ ${info.componentStack?.slice(0,180)||''}`),'react-boundary');}
  render(){
    if(this.state.failed)return <main className="center-state error-state"><div><h1>حدث خطأ غير متوقع</h1><p>بياناتك لم تُحذف. أعد تحميل الصفحة وحاول مرة أخرى.</p><button className="btn" onClick={()=>location.reload()}>إعادة تحميل الصفحة</button></div></main>;
    return this.props.children;
  }
}
