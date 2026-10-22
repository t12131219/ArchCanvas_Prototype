"""Configuration reads with consumed and unconsumed local unpack slots."""
import torch
from torch import Tensor, nn


class PartialDimensions(nn.Module):
    def patch(self, x: Tensor):
        first, second, spare = x.shape
        return x.reshape(first, second, -1).transpose(0, 1).contiguous()

    def forward(self, x: Tensor):
        return self.patch(x)


class FeatureDimension(nn.Module):
    def forward(self, x: Tensor):
        first, second, spare = x.shape
        return x.reshape(first, second, -1) * spare


class EscapingDimension(nn.Module):
    def forward(self, x: Tensor):
        first, second, spare = x.shape
        return x.reshape(first, second, -1), spare


class UnknownDimension(nn.Module):
    def forward(self, x: Tensor):
        first, second, spare = x.shape
        return x.reshape(first, second, -1), unfamiliar(spare)


class UnconsumedOnly(nn.Module):
    def forward(self, x: Tensor):
        first, second, spare = x.shape
        return x.contiguous()


class ConditionalDimensions(nn.Module):
    def forward(self, x: Tensor, flag):
        if flag:
            first, second, spare = x.shape
            return x.reshape(first, second, -1)
        return x.contiguous()


class CustomDimensions(nn.Module):
    def forward(self, x):
        first, second, spare = x.shape
        return x.reshape(first, second, -1)


class MixedDimensions(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.GRUCell(4, 4)

    def patch(self, x: Tensor):
        batch, length, remainder = x.shape
        return x.reshape(batch, length, -1).contiguous()

    def forward(self, x: Tensor, state: Tensor):
        branch = self.patch(x)
        recurrent = self.cell(branch, state)
        return unfamiliar(recurrent) * torch.sigmoid(x)


class InterruptedDimensions(nn.Module):
    def patch(self, x: Tensor):
        batch, length, remainder = x.shape
        return x.reshape(batch, length, -1).contiguous()

    def forward(self, x: Tensor, flag):
        known = self.patch(x)
        changed = unfamiliar(known)
        if flag:
            return changed
        return self.patch(known)
