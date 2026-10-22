"""Unfamiliar compositions of source reads, arithmetic and local boundaries."""
from torch import nn
from torch import Tensor
import torch


class ReadUnit(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('table', torch.zeros(16, 4))
        self.dropout = nn.Dropout(0.1)

    def forward(self, x: Tensor):
        part = self.table[:x.size(0)].to(dtype=x.dtype)
        return self.dropout(x + part)


class ReadWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = ReadUnit()
        self.right = ReadUnit()

    def forward(self, x: Tensor, context: Tensor):
        a = self.left(x)
        return self.right(a) * context + a


class PairReads(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('first', torch.ones(4))
        self.register_buffer('second', torch.zeros(4))

    def mix(self, x: Tensor):
        a = self.first.to(dtype=x.dtype)
        b = self.second.to(dtype=x.dtype)
        return torch.tanh(x + a + b)

    def forward(self, x: Tensor):
        return self.mix(x)


class SharedReadWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.unit = ReadUnit()

    def forward(self, x: Tensor, other: Tensor):
        return self.unit(x) + self.unit(other)


class EscapingRead(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('table', torch.zeros(4))
        self.known = ReadUnit()

    def fragment(self, x: Tensor):
        read = self.table
        return torch.tanh(x + read), read

    def forward(self, x: Tensor):
        return self.fragment(x), self.known(x)


class InterruptedRead(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('table', torch.zeros(4))
        self.known = ReadUnit()

    def fragment(self, x: Tensor):
        return torch.tanh(x + foreign_operation(self.table))

    def forward(self, x: Tensor):
        return self.fragment(x), self.known(x)


class ConditionalRead(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('table', torch.zeros(4))
        self.known = ReadUnit()

    def fragment(self, x: Tensor, flag):
        if flag:
            return torch.tanh(x + self.table)
        return x

    def forward(self, x: Tensor, flag):
        return self.fragment(x, flag), self.known(x)


class MutableRead(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('table', torch.zeros(4))
        self.known = ReadUnit()

    def fragment(self, x: Tensor):
        return torch.tanh(self.table.add_(x))

    def forward(self, x: Tensor):
        return self.fragment(x), self.known(x)
