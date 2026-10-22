"""Unfamiliar configuration expressions; no successful shape/rank assumption."""
import torch
from torch import Tensor, nn


class ConfiguredShape(nn.Module):
    def __init__(self):
        super().__init__()
        self.groups = 3
        self.width = 4

    def fold(self, x: Tensor):
        batch, length, channels = x.shape
        return x.view(batch, length, self.groups, self.width).transpose(1, 2).contiguous()

    def forward(self, x: Tensor):
        return self.fold(x)


class BoundAxes(nn.Module):
    def patch(self, x: Tensor, width, axis):
        return x.reshape(x.shape[0], width, -1).transpose(0, axis).contiguous()

    def forward(self, x: Tensor, width, axis):
        return self.patch(x, width, axis)


class ArithmeticShape(nn.Module):
    def patch(self, x: Tensor, factor):
        batch, length, width = x.shape
        return x.reshape(batch, length * factor, width // factor).contiguous()

    def forward(self, x: Tensor, factor):
        return self.patch(x, factor)


class EscapingShape(nn.Module):
    def forward(self, x: Tensor, axis):
        width = x.shape[0]
        y = x.reshape(width, -1).transpose(0, axis).contiguous()
        return y, width


class UnknownShape(nn.Module):
    def forward(self, x: Tensor, width):
        y = x.reshape(width, -1).contiguous()
        axis = unfamiliar(width)
        return y.transpose(0, axis).contiguous()


class ConditionalShape(nn.Module):
    def forward(self, x: Tensor, width, flag):
        if flag:
            return x.reshape(width, -1).contiguous()
        return x.transpose(0, 1).contiguous()


class MutableShape(nn.Module):
    def forward(self, x: Tensor, width):
        x.add_(1)
        return x.reshape(width, -1).contiguous()


class MixedShape(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x: Tensor, state: Tensor, axis):
        branch = x.transpose(0, axis).contiguous()
        return self.cell(branch, state) * torch.sigmoid(x)


class KeywordAxes(nn.Module):
    def patch(self, x: Tensor, axis: int):
        return torch.transpose(x, dim0=0, dim1=axis).contiguous()

    def forward(self, x: Tensor, axis: int):
        return self.patch(x, axis)
