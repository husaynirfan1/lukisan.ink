import React from 'react';
import { EmailValidationDemo } from '../components/EmailValidationDemo';

export const EmailValidationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <EmailValidationDemo />
    </div>
  );
};