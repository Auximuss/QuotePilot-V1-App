const ADMIN_EMAILS = [
  "aux6998@gmail.com",
  "pryeralex492@gmail.com",
];

export const ADMIN_EMAIL = ADMIN_EMAILS[0];
export const isAdmin = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());
