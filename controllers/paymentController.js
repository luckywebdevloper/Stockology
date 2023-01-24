/** @format */

import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/User.js";
import ErrorHandler from "../utils/errorHandler.js";
import { instance } from "../server.js";
import crypto from "crypto";
import { Payment } from "../models/Payment.js";

export const buySybscription = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (user.role === "admin")
    return next(new ErrorHandler("ADmin can't buy sbscription", 400));
  const plam_id = process.env.PLAN_ID || "Plan_jujuevKAcuZdtro";
  const subscription = await instance.subscriptions.create({
    plam_id,
    customer_notift: 1,
    total_count: 12,
  });
  user.subscription.id = subscription.id;
  user.subscription.status = subscription.status;
  await user.save();
  res.status(201).json({
    success: true,
    subscription,
  });
});

export const paymentverification = catchAsyncError(async (req, res, next) => {
  const { razorpay_singnature, razorpay_payment_id, razorpay_subscription_id } =
    req.body;
  const user = await User.findById(req.user._id);
  const subscription_id = user.subscription.id;
  const generated_singnature = crypto
    .createHmac("sha256", process.env.RAZORPAY_API_SECRET)
    .update(razorpay_payment_id + "|" + subscription_id, "utf-8")
    .digest("hex");

  const isAuthentic = generated_singnature === razorpay_singnature;
  if (!isAuthentic)
    return res.redirect(`${process.env.FRONTEND_URL}/paymentfaild`);
  // database Comes here

  await Payment.create({
    razorpay_singnature,
    razorpay_subscription_id,
    razorpay_payment_id,
  });
  user.subscription.status = "active";
  await user.save();
  res.redirect(
    `${process.env.FRONTEND_URL}/paymentsuccess?reference=${razorpay_payment_id}`
  );
});

export const getRazorPayKey = catchAsyncError(async (req, res, next) => {
  res.status(200).json({
    success: true,
    key: process.env.RAZORPAY_API_SECRET,
  });
});

export const cancleSubscription = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  const subscription_id = user.subscription.id;
  let refund = false;
  await instance.subscriptions.cancel(subscription_id);
  const payment = await Payment.findOne({
    razorpay_subscription_id: subscription_id,
  });
  const gap = Date.now() - payment.createdAt;
  const refundTime = process.env.REFUND_DAYS * 24 * 60 * 60 * 1000;
  if (refundTime > gap) {
    await instance.payments.refund(payment.razorpay_payment_id);
    refund = true;
  }
  await payment.remove();
  user.subscription.id = undefined;
  user.subscription.status = undefined;

  await user.save();

  res.status(200).json({
    success: true,
    message: refund
      ? "Subscription cancelled ,you wil received full payment refund with in 7 days"
      : "Subscription cancelled Now refund initiated as  subscription was cancelled after 7 days  ",
  });
});
