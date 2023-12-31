import express, {
    Request,
    Response,
    NextFunction,
    RequestHandler,
} from "express";
import { UserController } from "../controllers";
import {
    checkAccessToken,
    multerMiddleware,
    permissionMiddleware,
} from "../middlewares";
import { CredentialService, UserService } from "../services";
import { AppDataSource, uploadOnCloudinary } from "../config";
import { User } from "../entity";
import { Role } from "../constants";
import {
    IAuthRequest,
    IChangePasswordRequest,
    ISendOtpForChangeEmailRequest,
    IVerifyOtpForChangeEmailRequest,
} from "../types";
import {
    changePasswordDataValidator,
    updateFullNameDataValidator,
    verifyOtpDataValidator,
} from "../validators";
import emailValidator from "../validators/user/email.validator";

const router = express.Router();

const userRespository = AppDataSource.getRepository(User);
const userService = new UserService(userRespository, uploadOnCloudinary);
const credentialService = new CredentialService();
const userController = new UserController(userService, credentialService);

router.get(
    "/:userId",
    [checkAccessToken, permissionMiddleware([Role.ADMIN])],
    (req: Request, res: Response, next: NextFunction) =>
        userController.getOne(req, res, next) as unknown as RequestHandler,
);

router.get(
    "/",
    [checkAccessToken, permissionMiddleware([Role.ADMIN])],
    (req: Request, res: Response, next: NextFunction) =>
        userController.getAll(req, res, next) as unknown as RequestHandler,
);

router.delete(
    "/:userId",
    [checkAccessToken, permissionMiddleware([Role.ADMIN])],
    (req: Request, res: Response, next: NextFunction) =>
        userController.delete(req, res, next) as unknown as RequestHandler,
);

router.delete(
    "/",
    [checkAccessToken],
    (req: Request, res: Response, next: NextFunction) =>
        userController.deleteMySelf(
            req as IAuthRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/update-full-name",
    [
        updateFullNameDataValidator as unknown as RequestHandler,
        checkAccessToken,
    ],
    (req: Request, res: Response, next: NextFunction) =>
        userController.updateFullName(
            req as IAuthRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/upload-profile-picture",
    [checkAccessToken, multerMiddleware.single("avatar")],
    (req: Request, res: Response, next: NextFunction) =>
        userController.uploadProfilePicture(
            req as IAuthRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/change-password",
    [
        changePasswordDataValidator as unknown as RequestHandler,
        checkAccessToken,
    ],
    (req: Request, res: Response, next: NextFunction) =>
        userController.changePassword(
            req as IChangePasswordRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/send-otp-for-email-change",
    [emailValidator as unknown as RequestHandler, checkAccessToken],
    (req: Request, res: Response, next: NextFunction) =>
        userController.sendOtpForChangeEmail(
            req as ISendOtpForChangeEmailRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/verify-otp-for-email-change",
    [verifyOtpDataValidator as unknown as RequestHandler, checkAccessToken],
    (req: Request, res: Response, next: NextFunction) =>
        userController.verifyOtpForChangeEmail(
            req as IVerifyOtpForChangeEmailRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/send-otp-to-new-email-for-email-change",
    [emailValidator as unknown as RequestHandler, checkAccessToken],
    (req: Request, res: Response, next: NextFunction) =>
        userController.sendOtpForChangeEmailToNewEmail(
            req as ISendOtpForChangeEmailRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

router.post(
    "/verify-new-email-for-email-change",
    [verifyOtpDataValidator as unknown as RequestHandler, checkAccessToken],
    (req: Request, res: Response, next: NextFunction) =>
        userController.verifyOtpForChangeEmailByNewEmail(
            req as IVerifyOtpForChangeEmailRequest,
            res,
            next,
        ) as unknown as RequestHandler,
);

export default router;
