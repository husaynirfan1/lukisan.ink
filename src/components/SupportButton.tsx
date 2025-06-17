// src/components/SupportButton.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

export const SupportButton: React.FC = () => {
  const handleSupportClick = () => {
    const recipient = 'mhusaynirfan@lukisan.space';
    
    // Define the email subject
    const subject = 'Support Request From App User';

    // Define the email body template. Using a template literal for easy formatting.
    const body = `
Hello Support Team,

I need assistance with the following:

[**Please describe your issue or question here in as much detail as possible.**]


---
For better assistance, please provide details if applicable:
- What were you trying to do?
- What went wrong?
- Are there any error messages?
---

Thank you!
`;

    // URL-encode the subject and body to ensure they are correctly formatted in the mailto link
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body.trim()); // .trim() removes leading whitespace

    // Construct the final, enhanced mailto link
    const mailtoLink = `mailto:${recipient}?subject=${encodedSubject}&body=${encodedBody}`;

    // Open the user's default email client
    window.location.href = mailtoLink;
  };

  return (
    <motion.button
      onClick={handleSupportClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-8 right-8 z-50 w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors duration-300"
      aria-label="Contact Support"
    >
      <MessageSquare className="w-8 h-8" />
    </motion.button>
  );
};