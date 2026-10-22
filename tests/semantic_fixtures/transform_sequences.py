"""Structured source arguments, including broken and unfamiliar compositions."""
import torch
from torch import Tensor, nn


class TuplePatch(nn.Module):
    def patch(self, x: Tensor, width):
        return x.reshape((x.shape[0], width, -1)).permute((1, 0, 2)).contiguous()

    def forward(self, x: Tensor, width):
        return self.patch(x, width)


class ListPatch(nn.Module):
    def forward(self, x: Tensor, axis):
        return torch.reshape(x, shape=[x.shape[0], -1]).permute([axis, 0]).contiguous()


class ArithmeticTuple(nn.Module):
    def forward(self, x: Tensor, factor):
        batch, length, width = x.shape
        return x.reshape((batch, length * factor, width // factor)).contiguous()


class SingleTuple(nn.Module):
    def forward(self, x: Tensor, width):
        return x.reshape((width,)).contiguous()


class EmptyTuple(nn.Module):
    def forward(self, x: Tensor):
        return x.reshape(()).contiguous()


class UnknownTuple(nn.Module):
    def forward(self, x: Tensor, width):
        y = x.reshape((width, -1)).contiguous()
        return y.permute((unfamiliar(width), 0)).contiguous()


class ConditionalTuple(nn.Module):
    def forward(self, x: Tensor, width, flag):
        if flag:
            return x.reshape((width, -1))
        return x.permute((1, 0))


class MutableList(nn.Module):
    def forward(self, x: Tensor, width):
        shape = [width, -1]
        shape.append(width)
        return x.reshape(shape).contiguous()


class StarredTuple(nn.Module):
    def forward(self, x: Tensor, shape):
        return x.reshape((*shape, -1)).contiguous()


class EscapingTuple(nn.Module):
    def forward(self, x: Tensor, width):
        shape = (width, -1)
        return x.reshape(shape).contiguous(), shape


class MixedTuple(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.GRUCell(4, 4)

    def forward(self, x: Tensor, state: Tensor, width):
        branch = x.reshape((width, -1)).contiguous()
        recurrent = self.cell(branch, state)
        unknown = unfamiliar(recurrent)
        return unknown * torch.sigmoid(x)
