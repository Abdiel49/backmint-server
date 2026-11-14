import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthSessionGuard, CurrentSession } from './auth-session.guard.js';
import type { AuthenticatedSession } from './auth-session.service.js';
import {
  IssueWalletChallengeDto,
  issueWalletChallengeSchema,
  VerifyWalletLinkDto,
  verifyWalletLinkSchema,
  WalletChallengeResponseDto,
  WalletLinkResponseDto,
} from './wallet-link.dto.js';
import { WalletLinkService } from './wallet-link.service.js';

@ApiTags('Wallet links')
@ApiBearerAuth()
@UseGuards(AuthSessionGuard)
@Controller('auth/wallet')
export class WalletLinkController {
  constructor(private readonly wallets: WalletLinkService) {}

  @Post('challenges')
  @ApiOperation({
    summary: 'Issue a one-time challenge to prove control of a NEAR account',
  })
  @ApiBody({
    type: IssueWalletChallengeDto,
    examples: { testnetAccount: { value: { accountId: 'alice.testnet' } } },
  })
  @ApiCreatedResponse({
    description:
      'A short-lived NEP-413 challenge bound to the authenticated user and configured NEAR network.',
    type: WalletChallengeResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The NEAR account ID has an invalid format.',
    schema: {
      example: {
        statusCode: 400,
        message: 'accountId must be a valid NEAR account ID',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  async issueChallenge(
    @Body() body: IssueWalletChallengeDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = issueWalletChallengeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'accountId must be a valid NEAR account ID',
      );
    }
    return this.wallets.issueChallenge(session.userId, parsed.data.accountId);
  }

  @Post('links')
  @ApiOperation({
    summary: 'Verify a NEP-413 signature and create an account wallet link',
  })
  @ApiBody({
    type: VerifyWalletLinkDto,
    examples: {
      signedChallenge: {
        value: {
          challengeId: '5ac4e770-0f69-4d72-99e3-4d7f853499f4',
          nonce: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
          signature: `${'A'.repeat(86)}==`,
          publicKey: 'ed25519:11111111111111111111111111111111',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'The authenticated user now has a verified NEAR wallet link.',
    type: WalletLinkResponseDto,
    schema: {
      example: {
        id: '1ed85f24-fbe3-4a2b-8570-85571d64b76f',
        accountId: 'alice.testnet',
        network: 'testnet',
        publicKey: 'ed25519:11111111111111111111111111111111',
        verifiedAt: '2026-11-14T12:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-11-14T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'The request payload is invalid.' })
  @ApiUnauthorizedResponse({
    description:
      'The session, challenge, nonce, signature, or account-authorized key is invalid.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Wallet challenge is invalid or expired',
        error: 'Unauthorized',
      },
    },
  })
  @ApiConflictResponse({
    description: 'The NEAR account already has an active wallet link.',
  })
  async verifyAndLink(
    @Body() body: VerifyWalletLinkDto,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const parsed = verifyWalletLinkSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Wallet signature request is invalid');
    }
    const link = await this.wallets.verifyAndLink(session.userId, parsed.data);
    return {
      id: link.id,
      accountId: link.accountId,
      network: link.network,
      publicKey: link.publicKey,
      verifiedAt: link.verifiedAt,
      revokedAt: link.revokedAt,
      createdAt: link.createdAt,
    };
  }

  @Get('links')
  @ApiOperation({ summary: 'List active NEAR wallet links for the caller' })
  @ApiOkResponse({
    description: 'Active wallet links owned by the authenticated user.',
    type: WalletLinkResponseDto,
    isArray: true,
    schema: {
      example: [
        {
          id: '1ed85f24-fbe3-4a2b-8570-85571d64b76f',
          accountId: 'alice.testnet',
          publicKey: 'ed25519:11111111111111111111111111111111',
          verifiedAt: '2026-11-14T12:00:00.000Z',
          createdAt: '2026-11-14T12:00:00.000Z',
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  async listLinks(@CurrentSession() session: AuthenticatedSession) {
    const links = await this.wallets.listActiveLinks(session.userId);
    return links.map(
      ({ id, accountId, network, publicKey, verifiedAt, createdAt }) => ({
        id,
        accountId,
        network,
        publicKey,
        verifiedAt,
        createdAt,
      }),
    );
  }

  @Delete('links/:walletLinkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an active wallet link owned by the caller' })
  @ApiParam({
    name: 'walletLinkId',
    format: 'uuid',
    example: '1ed85f24-fbe3-4a2b-8570-85571d64b76f',
  })
  @ApiNoContentResponse({ description: 'The wallet link was revoked.' })
  @ApiUnauthorizedResponse({
    description: 'A valid bearer session is required.',
  })
  @ApiConflictResponse({
    description: 'The active wallet link was not found for the caller.',
  })
  async revokeLink(
    @Param('walletLinkId', ParseUUIDPipe) walletLinkId: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.wallets.revoke(session.userId, walletLinkId);
  }
}
