// Shared type definitions for the application

export type Expense = {
  id: string;
  description: string;
  amount: number;
  date: Date;
  volume?: string | null;
  unit?: number | null;
  unitPrice?: number | null;
  imagePath?: string | null;
  purchaserId: string;
  purchaser: {
    name: string;
    nickname?: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type BatchExpenseState = {
  error?: string;
  success?: string;
};

export type ActionResult<T = void> = 
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

export type TransactionStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export type UserStatus = 'Active' | 'Inactive' | 'Deleted';

export type PaymentMethod = 'CASH' | 'BKASH' | 'NAGAD' | 'BANK';

export type User = {
  id: string;
  name: string;
  email: string | null;
  image?: string | null;
  balance: number;
  status: UserStatus;
  isAdmin: boolean;
  nickname?: string | null;
};

export type Transaction = {
  id: string;
  amount: number;
  status: TransactionStatus;
  requesterId: string;
  approverId: string;
  paymentMethod?: PaymentMethod;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MealStatus = {
  id: string;
  date: Date;
  userId: string;
  lunch: number;
  dinner: number;
};
