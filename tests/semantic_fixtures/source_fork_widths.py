"""Shared outer values in unfamiliar helpers; no valid-shape assumption."""
from torch import Tensor, nn


class BorrowedGrid(nn.Module):
    def __init__(self):
        super().__init__()
        self.group_count = 3
        self.group_width = 4

    def patch(self, value: Tensor):
        batch, rows, channels = value.shape
        return value.view(batch, rows, self.group_count, self.group_width).transpose(0, 1).contiguous()

    def forward(self, value: Tensor):
        return self.patch(value)


class SeparateGrid(nn.Module):
    def __init__(self):
        super().__init__()
        self.group_count = 3
        self.group_width = 4

    def patch(self, left: Tensor, right: Tensor):
        batch, rows, channels = left.shape
        return right.view(batch, rows, self.group_count, self.group_width).transpose(0, 1).contiguous()

    def forward(self, left: Tensor, right: Tensor):
        return self.patch(left, right)


class MixedGrid(nn.Module):
    def __init__(self):
        super().__init__()
        self.group_count = 3
        self.group_width = 4

    def patch(self, value: Tensor):
        batch, rows, channels = value.shape
        return value.view(batch, rows, self.group_count, self.group_width).transpose(0, 1).contiguous()

    def forward(self, value: Tensor, state: Tensor, flag):
        known = self.patch(value)
        unknown = unfamiliar(known, state)
        if flag:
            return unknown + known
        return unknown * state
