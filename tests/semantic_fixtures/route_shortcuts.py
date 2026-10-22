"""Unfamiliar local paths interlaced with context, conditions and state."""
import torch
from torch import Tensor, nn


class InterlacedStreams(nn.Module):
    def patch(self, x: Tensor):
        a, b, spare = x.shape
        return x.reshape(a, b, -1).transpose(0, 1).contiguous()

    def mix(self, first: Tensor, second: Tensor, context: Tensor):
        left = self.patch(first)
        right = self.patch(second)
        return torch.sigmoid(left + context) * right

    def forward(self, x: Tensor, y: Tensor, context: Tensor):
        return self.mix(x, y, context)


class InterruptedStreams(nn.Module):
    def patch(self, x: Tensor):
        a, b, spare = x.shape
        return x.reshape(a, b, -1).transpose(0, 1).contiguous()

    def forward(self, x: Tensor, state: Tensor, flag):
        local = self.patch(x)
        foreign = unfamiliar(local, state)
        if flag:
            return foreign + local
        return foreign * state


class StatefulStreams(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.GRUCell(4, 4)

    def patch(self, x: Tensor):
        a, b, spare = x.shape
        return x.reshape(a, b, -1).contiguous()

    def forward(self, x: Tensor, state: Tensor):
        local = self.patch(x)
        hidden = self.cell(local, state)
        return unfamiliar(hidden, local) * torch.sigmoid(x + state)
