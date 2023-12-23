import { Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { CredentialService, TokenService, UserService } from "../services";
import {
    IAuthRequest,
    ILoginRequest,
    ISendOtpRequestData,
    IVerifyOtpRequestData,
    TPayload,
} from "../types";
import { Logger } from "winston";
import createHttpError from "http-errors";
import { Role } from "../constants";

class AuthController {
    constructor(
        private userService: UserService,
        private logger: Logger,
        private credentialService: CredentialService,
        private tokenService: TokenService,
    ) {}

    /* [send-otp] endpoint fo send otp by a email to user */
    async sendOtp(req: ISendOtpRequestData, res: Response, next: NextFunction) {
        /*  Validate SendOtpData from user [fullName, email, password, confirmPassword] */
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({ error: result.array() });
        }

        const { fullName, email, password, confirmPassword } = req.body;

        this.logger.info({
            fullName,
            email,
            passowrd: null,
            confirmPassword: null,
        });

        // check comfirm password and password is match
        if (password !== confirmPassword) {
            const err = createHttpError(
                400,
                "confirm password not match to password!",
            );
            return next(err);
        }

        /* check email already registered */
        try {
            const user = await this.userService.findUserByEmail(email);
            if (user) {
                return next(
                    createHttpError(400, "This email already registered!"),
                );
            }
        } catch (error) {
            return next(error);
        }

        /* hash password and hash otp*/
        try {
            const hashPassword =
                await this.credentialService.hashDataUsingBcrypt(password);

            const ttl = 1000 * 60 * 10;
            const expires = Date.now() + ttl;
            const otp = this.credentialService.generateOtp();

            // TODO: make notification webhook for send otp for user by email

            const prepareDataForHash = `${otp}.${email}.${expires}.${hashPassword}`;
            const hashOtpData =
                this.credentialService.hashDataUsingCrypto(prepareDataForHash);

            const hashOtp = `${hashOtpData}#${expires}#${hashPassword}`;

            // FIXME: remove otp from res

            return res.json({ fullName, email, hashOtp, otp });
        } catch (error) {
            next(error);
        }
    }

    async verifyOtp(
        req: IVerifyOtpRequestData,
        res: Response,
        next: NextFunction,
    ) {
        /*  Validate SendOtpData from user [fullName, email, otp, hashOtp] */
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({ error: result.array() });
        }

        const { fullName, email, otp, hashOtp } = req.body;

        /* check email already registered */
        try {
            const user = await this.userService.findUserByEmail(email);
            if (user) {
                return next(
                    createHttpError(400, "This email already registered!"),
                );
            }
        } catch (error) {
            return next(error);
        }

        // check hash otp is valid
        if (hashOtp.split("#").length !== 3) {
            const error = createHttpError(400, "Otp is invalid!");
            return next(error);
        }

        // verify otp and hash otp
        const [prevHashedOtp, expires, hashPassword] = hashOtp.split("#");
        try {
            if (Date.now() > +expires) {
                const error = createHttpError(408, "Otp is expired!");
                return next(error);
            }

            // prepare hash data
            const prepareDataForHash = `${otp}.${email}.${expires}.${hashPassword}`;
            const hashOtpData =
                this.credentialService.hashDataUsingCrypto(prepareDataForHash);

            if (hashOtpData !== prevHashedOtp) {
                const error = createHttpError(400, "Otp is invalid!");
                return next(error);
            }
        } catch (error) {
            return next(error);
        }

        // register user
        let user;
        try {
            user = await this.userService.saveUser({
                fullName,
                email,
                password: hashPassword,
                role: Role.CUSTOMER,
            });
        } catch (error) {
            next(error);
        }

        if (!user) {
            return next(createHttpError(500, "Internal Server Error!"));
        }

        // create cookies
        try {
            const payload: TPayload = {
                userId: String(user.id),
                role: user.role,
            };

            /* sign access token */
            const accessToken = this.tokenService.signAccessToken(payload);

            /* save refresh token with user */
            const tokenRef = await this.tokenService.saveRefreshToken(user);

            /* sign refresh token */
            const refreshToken = this.tokenService.signRefreshToken({
                ...payload,
                tokenId: String(tokenRef.id),
            });

            res.cookie("accessToken", accessToken, {
                domain: "localhost",
                sameSite: "strict",
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 /* 24 hourse */,
            });

            res.cookie("refreshToken", refreshToken, {
                domain: "localhost",
                sameSite: "strict",
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 365 /* 1 year */,
            });
        } catch (error) {
            return next(error);
        }

        return res.json(user);
    }

    async self(req: IAuthRequest, res: Response, next: NextFunction) {
        const userId = req.auth.userId;
        try {
            const user = await this.userService.findUserById(Number(userId));
            if (!user) return next(createHttpError(400, "User not found!"));
            res.json(user);
        } catch (error) {
            next(error);
        }
    }

    async logout(req: IAuthRequest, res: Response, next: NextFunction) {
        const tokenId = Number(req.auth.tokenId);
        try {
            await this.tokenService.deleteToken(Number(tokenId));
            res.clearCookie("accessToken");
            res.clearCookie("refreshToken");
            res.json({
                user: null,
                message: "User successfully logout.",
            });
        } catch (error) {
            next(error);
        }
    }

    async login(req: ILoginRequest, res: Response, next: NextFunction) {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({ error: result.array() });
        }

        const { email, password } = req.body;
        let user;
        try {
            user = await this.userService.findUserByEmailWithPassword(email);
            if (!user) {
                return next(
                    createHttpError(400, "Email or Password does not match!"),
                );
            }
        } catch (error) {
            return next(error);
        }
        try {
            const isMatch = await this.credentialService.hashCompare(
                password,
                user.password,
            );

            if (!isMatch)
                return next(
                    createHttpError(400, "Email or Password does not match!"),
                );
        } catch (error) {
            return next(error);
        }

        // create cookies
        try {
            const payload: TPayload = {
                userId: String(user.id),
                role: user.role,
            };

            /* sign access token */
            const accessToken = this.tokenService.signAccessToken(payload);

            /* save refresh token with user */
            const tokenRef = await this.tokenService.saveRefreshToken(user);

            /* sign refresh token */
            const refreshToken = this.tokenService.signRefreshToken({
                ...payload,
                tokenId: String(tokenRef.id),
            });

            res.cookie("accessToken", accessToken, {
                domain: "localhost",
                sameSite: "strict",
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 /* 24 hourse */,
            });

            res.cookie("refreshToken", refreshToken, {
                domain: "localhost",
                sameSite: "strict",
                httpOnly: true,
                maxAge: 1000 * 60 * 60 * 24 * 365 /* 1 year */,
            });
        } catch (error) {
            return next(error);
        }

        return res.json({ ...user, password: null });
    }
}

export default AuthController;
